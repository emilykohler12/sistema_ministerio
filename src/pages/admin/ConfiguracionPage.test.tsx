import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guardarConfiguracion, obtenerConfiguracion, urlLogo } from '@/features/configuracion/consultas'
import { cambiarLogo, quitarLogo } from '@/features/configuracion/secuencias'
import type { Configuracion } from '@/features/configuracion/types'
import { renderConProviders } from '@/test/utils'
import { ConfiguracionPage } from './ConfiguracionPage'

/*
 * Contrato de consultas: ver useConfiguracion.test.ts. ConfiguracionPage no usa useAuth,
 * así que no se monta AuthProvider.
 * Textos asumidos: etiquetas "Nombre de la institución" y "Correo de contacto", botón
 * "Guardar cambios", éxito "Cambios guardados". Los errores (de validación y de guardado)
 * se muestran en elementos con role="alert".
 *
 * Logo (issue #23): vive en su propia Card fuera del <form>. Contrato asumido:
 *   - botones «Cambiar logo» (siempre) y «Quitar logo» (solo si hay logo), ambos type="button"; hay un <input type="file">;
 *   - un único role="status" siempre montado anuncia el resultado: «Logo actualizado», «Logo quitado» o el error
 *     (mensajeDeErrorLogo / motivo de validarLogo);
 *   - «Quitar logo» abre un diálogo (role="dialog") con «Cancelar» y un botón de confirmación que contiene «Quitar»;
 *   - secuencias.cambiarLogo(file, anterior) y secuencias.quitarLogo(anterior) (mockeadas acá);
 *   - la vista previa es una <img> con alt que menciona «logo».
 */
vi.mock('@/features/configuracion/consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
  urlLogo: vi.fn(),
}))
vi.mock('@/features/configuracion/secuencias', () => ({
  cambiarLogo: vi.fn(),
  quitarLogo: vi.fn(),
}))

const fila: Configuracion = {
  id: 1,
  nombre: 'Ministerio de Educación de Misiones',
  logo_ruta: null,
  telefono: '',
  correo: '',
  direccion: '',
  facebook: '',
  instagram: '',
  quienes_somos: '',
  mision: '',
  vision: '',
  updated_at: '2026-10-10T00:00:00Z',
}

async function renderPagina() {
  vi.mocked(obtenerConfiguracion).mockResolvedValue(fila)
  renderConProviders(<ConfiguracionPage />)
  const nombre = await screen.findByLabelText('Nombre de la institución')
  await waitFor(() => expect(nombre).toHaveValue(fila.nombre))
  return nombre
}

const guardar = () => userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(urlLogo).mockImplementation((ruta) => `https://storage.test/logo/${ruta}`)
})

describe('ConfiguracionPage', () => {
  it('permite guardar con solo el nombre completo y el resto vacío', async () => {
    vi.mocked(guardarConfiguracion).mockResolvedValue(fila)
    await renderPagina()
    await guardar()
    await waitFor(() => expect(guardarConfiguracion).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  })

  it('guardarConfiguracion no recibe id, logo_ruta ni updated_at', async () => {
    vi.mocked(guardarConfiguracion).mockResolvedValue(fila)
    await renderPagina()
    await guardar()
    await waitFor(() => expect(guardarConfiguracion).toHaveBeenCalledTimes(1))
    const enviado = vi.mocked(guardarConfiguracion).mock.calls[0][0]
    expect(enviado).not.toHaveProperty('id')
    expect(enviado).not.toHaveProperty('logo_ruta')
    expect(enviado).not.toHaveProperty('updated_at')
    expect(enviado.nombre).toBe(fila.nombre)
  })

  it('tras guardar, el campo muestra el valor que zod recortó y no los espacios que se escribieron', async () => {
    vi.mocked(guardarConfiguracion).mockImplementation(async (cambios) => ({ ...fila, ...cambios }))
    const nombre = await renderPagina()
    await userEvent.clear(nombre)
    await userEvent.type(nombre, '  Escuela X  ')
    await guardar()
    await waitFor(() => expect(guardarConfiguracion).toHaveBeenCalledTimes(1))
    expect(vi.mocked(guardarConfiguracion).mock.calls[0][0].nombre).toBe('Escuela X')
    await screen.findByText('Cambios guardados')
    expect(nombre).toHaveValue('Escuela X')
  })

  it('si la carga falla muestra un alert sin formulario, y "Reintentar" vuelve a consultar', async () => {
    vi.mocked(obtenerConfiguracion).mockRejectedValueOnce(new Error('sin red'))
    renderConProviders(<ConfiguracionPage />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(obtenerConfiguracion).toHaveBeenCalledTimes(1)

    vi.mocked(obtenerConfiguracion).mockResolvedValue(fila)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByLabelText('Nombre de la institución')).toHaveValue(fila.nombre)
    expect(obtenerConfiguracion).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('con el nombre vacío muestra un error de validación y no guarda', async () => {
    const nombre = await renderPagina()
    await userEvent.clear(nombre)
    await guardar()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(guardarConfiguracion).not.toHaveBeenCalled()
  })

  it('con un correo que no es email muestra un error y no guarda', async () => {
    await renderPagina()
    await userEvent.type(screen.getByLabelText('Correo de contacto'), 'algo')
    await guardar()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(guardarConfiguracion).not.toHaveBeenCalled()
  })

  it('con el correo vacío no muestra error', async () => {
    vi.mocked(guardarConfiguracion).mockResolvedValue(fila)
    await renderPagina()
    await guardar()
    await waitFor(() => expect(guardarConfiguracion).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si guardar falla muestra un error en role="alert" y no "Cambios guardados"', async () => {
    vi.mocked(guardarConfiguracion).mockRejectedValue(new Error('RLS'))
    await renderPagina()
    await guardar()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
  })

  describe.each(['Facebook', 'Instagram'] as const)('red social %s', (etiqueta) => {
    const clave = etiqueta.toLowerCase() as 'facebook' | 'instagram'
    const mensaje = 'Ingresá una URL que empiece con https://'

    it('sin https:// muestra el error, lo asocia al campo y no guarda', async () => {
      await renderPagina()
      const campo = screen.getByLabelText(etiqueta)
      await userEvent.type(campo, `${clave}.com/x`)
      await guardar()
      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent(mensaje)
      expect(campo).toHaveAttribute('aria-invalid', 'true')
      expect(campo).toHaveAttribute('aria-describedby', alerta.id)
      expect(guardarConfiguracion).not.toHaveBeenCalled()
    })

    it('con http:// lo rechaza', async () => {
      await renderPagina()
      await userEvent.type(screen.getByLabelText(etiqueta), `http://${clave}.com/x`)
      await guardar()
      expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
      expect(guardarConfiguracion).not.toHaveBeenCalled()
    })

    it('con el prefijo https:// solo lo rechaza', async () => {
      await renderPagina()
      await userEvent.type(screen.getByLabelText(etiqueta), ' https:// ')
      await guardar()
      expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
      expect(guardarConfiguracion).not.toHaveBeenCalled()
    })

    it('con solo espacios se guarda como cadena vacía', async () => {
      vi.mocked(guardarConfiguracion).mockResolvedValue(fila)
      await renderPagina()
      await userEvent.type(screen.getByLabelText(etiqueta), '   ')
      await guardar()
      await waitFor(() => expect(guardarConfiguracion).toHaveBeenCalledTimes(1))
      expect(vi.mocked(guardarConfiguracion).mock.calls[0][0][clave]).toBe('')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('quita los espacios de los extremos de una URL https válida', async () => {
      vi.mocked(guardarConfiguracion).mockResolvedValue(fila)
      await renderPagina()
      await userEvent.type(screen.getByLabelText(etiqueta), `  https://${clave}.com/x `)
      await guardar()
      await waitFor(() => expect(guardarConfiguracion).toHaveBeenCalledTimes(1))
      expect(vi.mocked(guardarConfiguracion).mock.calls[0][0][clave]).toBe(`https://${clave}.com/x`)
    })

    it('vacío sigue siendo válido y no tiene aria-describedby', async () => {
      vi.mocked(guardarConfiguracion).mockResolvedValue(fila)
      await renderPagina()
      await guardar()
      await waitFor(() => expect(guardarConfiguracion).toHaveBeenCalledTimes(1))
      expect(vi.mocked(guardarConfiguracion).mock.calls[0][0][clave]).toBe('')
      expect(screen.getByLabelText(etiqueta)).not.toHaveAttribute('aria-describedby')
    })
  })

})

describe('ConfiguracionPage: logo', () => {
  const RUTA = '11111111-1111-1111-1111-111111111111.png'
  const conLogo: Configuracion = { ...fila, logo_ruta: RUTA }
  const user = () => userEvent.setup({ applyAccept: false })
  const png = (nombre = 'logo.png') => new File(['x'], nombre, { type: 'image/png' })
  const inputArchivo = () => document.querySelector<HTMLInputElement>('input[type="file"]')!
  const cambiar = () => screen.getByRole('button', { name: 'Cambiar logo' })
  const quitar = () => screen.getByRole('button', { name: 'Quitar logo' })
  const estado = () => screen.getByRole('status')

  async function renderConLogo(config: Configuracion = conLogo) {
    vi.mocked(obtenerConfiguracion).mockResolvedValue(config)
    renderConProviders(<ConfiguracionPage />)
    const nombre = await screen.findByLabelText('Nombre de la institución')
    await waitFor(() => expect(nombre).toHaveValue(config.nombre))
  }

  it('ofrece «Cambiar logo», y «Quitar logo» solo si hay logo', async () => {
    await renderPagina()
    expect(cambiar()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar logo' })).not.toBeInTheDocument()
  })

  it('con logo ofrece «Quitar logo» y la vista previa lleva alt', async () => {
    await renderConLogo()
    expect(quitar()).toBeInTheDocument()
    const previa = screen.getByRole('img', { name: /logo/i })
    expect(previa).toHaveAttribute('src', `https://storage.test/logo/${RUTA}`)
  })

  it('los controles del logo están fuera del <form> y son type="button"', async () => {
    await renderConLogo()
    for (const boton of [cambiar(), quitar()]) {
      expect(boton).toHaveAttribute('type', 'button')
      expect(boton.closest('form')).toBeNull()
    }
    expect(inputArchivo().closest('form')).toBeNull()
    expect(estado().closest('form')).toBeNull()
  })

  it('hay un único role="status", montado desde el principio y vacío', async () => {
    await renderConLogo()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(estado()).toBeEmptyDOMElement()
  })

  it('«Cambiar logo» abre el selector de archivos sin enviar el formulario', async () => {
    await renderConLogo()
    const clic = vi.spyOn(inputArchivo(), 'click')
    await user().click(cambiar())
    expect(clic).toHaveBeenCalled()
    expect(guardarConfiguracion).not.toHaveBeenCalled()
  })

  it('un archivo de formato inválido (.gif) muestra el motivo y no sube nada', async () => {
    await renderConLogo()
    await user().upload(inputArchivo(), new File(['x'], 'logo.gif', { type: 'image/gif' }))
    await waitFor(() => expect(estado()).toHaveTextContent(/PNG/))
    expect(cambiarLogo).not.toHaveBeenCalled()
    expect(guardarConfiguracion).not.toHaveBeenCalled()
  })

  it('un archivo de más de 2 MB muestra el motivo y no sube nada', async () => {
    await renderConLogo()
    await user().upload(inputArchivo(), new File([new ArrayBuffer(2_097_153)], 'grande.png', { type: 'image/png' }))
    await waitFor(() => expect(estado()).toHaveTextContent(/2 MB/))
    expect(cambiarLogo).not.toHaveBeenCalled()
  })

  it('un archivo válido llama a cambiarLogo con el archivo y el logo anterior, y anuncia el éxito', async () => {
    vi.mocked(cambiarLogo).mockResolvedValue({ ...conLogo, logo_ruta: 'nueva.png' })
    await renderConLogo()
    const file = png()
    await user().upload(inputArchivo(), file)
    await waitFor(() => expect(cambiarLogo).toHaveBeenCalledWith(file, RUTA))
    await waitFor(() => expect(estado()).toHaveTextContent('Logo actualizado'))
    expect(screen.getByRole('img', { name: /logo/i })).toHaveAttribute('src', 'https://storage.test/logo/nueva.png')
    expect(guardarConfiguracion).not.toHaveBeenCalled()
  })

  it('sin logo previo llama a cambiarLogo con anterior null', async () => {
    vi.mocked(cambiarLogo).mockResolvedValue(conLogo)
    await renderPagina()
    const file = png()
    await user().upload(inputArchivo(), file)
    await waitFor(() => expect(cambiarLogo).toHaveBeenCalledWith(file, null))
  })

  it('si cambiarLogo falla anuncia el error en el status y el logo actual no cambia', async () => {
    vi.mocked(cambiarLogo).mockRejectedValue({ code: 'PGRST116', message: '0 rows' })
    await renderConLogo()
    await user().upload(inputArchivo(), png())
    await waitFor(() => expect(estado()).toHaveTextContent(/cambió/))
    expect(estado()).not.toHaveTextContent('Logo actualizado')
    expect(screen.getByRole('img', { name: /logo/i })).toHaveAttribute('src', `https://storage.test/logo/${RUTA}`)
  })

  it('un rechazo 413 del servidor muestra el mismo mensaje de tamaño', async () => {
    vi.mocked(cambiarLogo).mockRejectedValue({ status: 400, statusCode: '413' })
    await renderConLogo()
    await user().upload(inputArchivo(), png())
    await waitFor(() => expect(estado()).toHaveTextContent(/2 MB/))
  })

  it('vacía el input tras leer el archivo, así se puede reelegir el mismo después de un error', async () => {
    vi.mocked(cambiarLogo).mockRejectedValueOnce(new Error('sin red')).mockResolvedValue(conLogo)
    await renderConLogo()
    const file = png()
    const u = user()
    await u.upload(inputArchivo(), file)
    await waitFor(() => expect(cambiarLogo).toHaveBeenCalledTimes(1))
    expect(inputArchivo().value).toBe('')
    await waitFor(() => expect(cambiar()).toBeEnabled())

    await u.upload(inputArchivo(), file)
    await waitFor(() => expect(cambiarLogo).toHaveBeenCalledTimes(2))
  })

  it('mientras cambiarLogo está pendiente, deshabilita «Cambiar logo», «Quitar logo» y «Guardar cambios»', async () => {
    let resolver!: (f: Configuracion) => void
    vi.mocked(cambiarLogo).mockReturnValue(new Promise((res) => (resolver = res)))
    await renderConLogo()
    await user().upload(inputArchivo(), png())

    await waitFor(() => expect(cambiar()).toBeDisabled())
    expect(quitar()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()

    resolver({ ...conLogo, logo_ruta: 'nueva.png' })
    await waitFor(() => expect(cambiar()).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('mientras «Guardar cambios» está pendiente, los botones del logo quedan deshabilitados', async () => {
    let resolver!: (f: Configuracion) => void
    vi.mocked(guardarConfiguracion).mockReturnValue(new Promise((res) => (resolver = res)))
    await renderConLogo()
    await user().click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(cambiar()).toBeDisabled())
    expect(quitar()).toBeDisabled()

    resolver(conLogo)
    await waitFor(() => expect(cambiar()).toBeEnabled())
  })

  it('«Quitar logo» pide confirmación y no quita nada hasta confirmar', async () => {
    await renderConLogo()
    await user().click(quitar())
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(quitarLogo).not.toHaveBeenCalled()
    expect(guardarConfiguracion).not.toHaveBeenCalled()
  })

  it('cancelar la confirmación no quita el logo ni envía el formulario', async () => {
    await renderConLogo()
    const u = user()
    await u.click(quitar())
    const dialogo = await screen.findByRole('dialog')
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(quitarLogo).not.toHaveBeenCalled()
    expect(guardarConfiguracion).not.toHaveBeenCalled()
  })

  it('al confirmar llama a quitarLogo con el logo actual, anuncia «Logo quitado» y el foco va a «Cambiar logo»', async () => {
    vi.mocked(quitarLogo).mockResolvedValue({ ...conLogo, logo_ruta: null })
    await renderConLogo()
    const u = user()
    await u.click(quitar())
    const dialogo = await screen.findByRole('dialog')
    await u.click(within(dialogo).getByRole('button', { name: /quitar/i }))

    await waitFor(() => expect(quitarLogo).toHaveBeenCalledWith(RUTA))
    await waitFor(() => expect(estado()).toHaveTextContent('Logo quitado'))
    expect(screen.queryByRole('button', { name: 'Quitar logo' })).not.toBeInTheDocument()
    expect(cambiar()).toHaveFocus()
    expect(guardarConfiguracion).not.toHaveBeenCalled()
  })

  it('si quitarLogo falla anuncia el error y el logo sigue', async () => {
    vi.mocked(quitarLogo).mockRejectedValue(new Error('RLS'))
    await renderConLogo()
    const u = user()
    await u.click(quitar())
    const dialogo = await screen.findByRole('dialog')
    await u.click(within(dialogo).getByRole('button', { name: /quitar/i }))

    await waitFor(() => expect(estado()).toHaveTextContent(/No pudimos/))
    expect(quitar()).toBeInTheDocument()
  })

  it('tras un cambio exitoso el foco vuelve a «Cambiar logo»', async () => {
    vi.mocked(cambiarLogo).mockResolvedValue({ ...conLogo, logo_ruta: 'nueva.png' })
    await renderConLogo()
    await user().upload(inputArchivo(), png())
    await waitFor(() => expect(estado()).toHaveTextContent('Logo actualizado'))
    expect(cambiar()).toHaveFocus()
  })

  it('tras un cambio fallido el foco vuelve a «Cambiar logo»', async () => {
    vi.mocked(cambiarLogo).mockRejectedValue(new Error('sin red'))
    await renderConLogo()
    await user().upload(inputArchivo(), png())
    await waitFor(() => expect(estado()).toHaveTextContent(/No pudimos/))
    expect(cambiar()).toHaveFocus()
  })

  it('tras un «Quitar logo» fallido el foco vuelve a «Cambiar logo»', async () => {
    vi.mocked(quitarLogo).mockRejectedValue(new Error('RLS'))
    await renderConLogo()
    const u = user()
    await u.click(quitar())
    const dialogo = await screen.findByRole('dialog')
    await u.click(within(dialogo).getByRole('button', { name: /quitar/i }))
    await waitFor(() => expect(estado()).toHaveTextContent(/No pudimos/))
    expect(cambiar()).toHaveFocus()
  })

  it('un archivo rechazado por validación no mueve el foco ni deshabilita nada', async () => {
    await renderConLogo()
    await user().upload(inputArchivo(), new File(['x'], 'logo.gif', { type: 'image/gif' }))
    await waitFor(() => expect(estado()).toHaveTextContent(/PNG/))
    expect(cambiar()).toBeEnabled()
  })

  it('lo escrito sin guardar en «Misión» se conserva al cambiar el logo', async () => {
    vi.mocked(cambiarLogo).mockResolvedValue({
      ...conLogo,
      logo_ruta: 'nueva.png',
      updated_at: '2026-11-11T00:00:00Z',
    })
    await renderConLogo()
    const u = user()
    await u.type(screen.getByLabelText('Misión'), 'Texto sin guardar')
    await u.upload(inputArchivo(), png())

    await waitFor(() => expect(estado()).toHaveTextContent('Logo actualizado'))
    expect(screen.getByLabelText('Misión')).toHaveValue('Texto sin guardar')
  })

  it('lo escrito sin guardar se conserva también al quitar el logo', async () => {
    vi.mocked(quitarLogo).mockResolvedValue({ ...conLogo, logo_ruta: null, updated_at: '2026-11-11T00:00:00Z' })
    await renderConLogo()
    const u = user()
    await u.type(screen.getByLabelText('Misión'), 'Texto sin guardar')
    await u.click(quitar())
    const dialogo = await screen.findByRole('dialog')
    await u.click(within(dialogo).getByRole('button', { name: /quitar/i }))

    await waitFor(() => expect(estado()).toHaveTextContent('Logo quitado'))
    expect(screen.getByLabelText('Misión')).toHaveValue('Texto sin guardar')
  })
})
