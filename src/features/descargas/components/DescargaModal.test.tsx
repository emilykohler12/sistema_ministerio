import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerEstablecimientos, obtenerLocalidades } from '@/features/establecimientos/consultas'
import type { Establecimiento } from '@/features/establecimientos/types'
import { ETIQUETA_TIPO_RECURSO, type Recurso } from '@/features/recursos/types'
import type { Taller } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { firmarEnlaces, registrarDescarga } from '../consultas'
import { marcarTallerRegistrado } from '../visita'
import { DescargaModal } from './DescargaModal'

/*
 * Contrato (corte descargas, criterios 2, 3, 4 y 5). DescargaModal({ taller, open, onClose }): con open=false no renderiza nada.
 * Dos pasos. Formulario (orden cargo -> localidad -> institución), con selects nativos y estas etiquetas:
 *   "Cargo" (opciones: los CARGOS), "Especificá tu cargo" (solo con cargo "Otro"), "Localidad" (las 79; aquí, las del mock),
 *   "Institución" (los establecimientos ACTIVOS de la localidad elegida + "Otra" + "Sin institución"; vacía hasta elegir),
 *   "Nombre de la institución" (solo con "Otra"), botón "Descargar" para enviar y botón "Cerrar"/"Cancelar" que llama onClose.
 * Lista (tras registrar, o directo si el taller ya está registrado en la visita): por recurso, nombre, tipo
 *   (ETIQUETA_TIPO_RECURSO) y tamaño; un texto con "total" y la suma; los archivos son enlaces <a href=url firmada>;
 *   los enlaces externos <a target="_blank" rel="noopener noreferrer">.
 * Errores (role="alert"): DA003 "Este taller ya no está disponible"; DA004 "La institución elegida ya no está disponible"
 *   y recarga la lista de establecimientos de la localidad; fallo de firma tras registrar: alert con botón "Reintentar"
 *   que solo vuelve a firmar.
 * Los hooks son los reales; se mockean ../consultas y establecimientos/consultas. Cada test usa un id de taller propio
 * porque la marca de "registrado" vive en memoria en el módulo visita.
 */
vi.mock('../consultas', () => ({
  registrarDescarga: vi.fn(),
  firmarEnlaces: vi.fn(),
}))
vi.mock('@/features/establecimientos/consultas', () => ({
  obtenerLocalidades: vi.fn(),
  obtenerEstablecimientos: vi.fn(),
  obtenerEstablecimiento: vi.fn(),
  crearEstablecimiento: vi.fn(),
  actualizarEstablecimiento: vi.fn(),
}))

const localidades = [
  { id: 1, nombre: 'Posadas' },
  { id: 2, nombre: 'Oberá' },
  { id: 3, nombre: 'Eldorado' },
]

function establecimiento(id: number, nombre: string, localidad_id: number, activo = true): Establecimiento {
  return {
    id,
    cue: null,
    nombre,
    localidad_id,
    activo,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
  }
}

const establecimientos: Record<number, Establecimiento[]> = {
  1: [establecimiento(10, 'Escuela Activa Uno', 1), establecimiento(11, 'Escuela Inactiva', 1, false)],
  2: [establecimiento(20, 'Escuela de Oberá', 2)],
  3: [],
}

function recurso(id: number, orden: number, p: Partial<Recurso> = {}): Recurso {
  return {
    id,
    taller_id: 7,
    nombre: `Recurso ${id}`,
    tipo: 'PDF',
    ruta_archivo: `7/${id}.pdf`,
    url: null,
    tamanio_bytes: 1572864,
    orden,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}
const recursos: Recurso[] = [
  recurso(1, 1, { nombre: 'Guía de huerta' }),
  recurso(2, 2, { nombre: 'Presentación', tipo: 'PPTX', ruta_archivo: '7/2.pptx', tamanio_bytes: 2097152 }),
  recurso(3, 3, { nombre: 'Sitio del programa', tipo: 'ENLACE', ruta_archivo: null, tamanio_bytes: null, url: 'https://example.com/programa' }),
]

let siguienteId = 500
function unTaller(): Taller {
  const id = siguienteId++
  return {
    id,
    categoria_id: 7,
    nombre: `Taller ${id}`,
    descripcion: '',
    estado: 'PUBLICADO',
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    categoria: { nivel_id: 3 },
    destinatario: [],
    etiqueta: [],
    recurso: recursos.map((r) => ({ ...r, taller_id: id })),
  }
}

const cargo = () => screen.getByLabelText('Cargo')
const localidad = () => screen.getByLabelText('Localidad')
const institucion = () => screen.getByLabelText('Institución')
const enviar = () => screen.getByRole('button', { name: 'Descargar' })

async function elegirLocalidad(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await within(localidad()).findByRole('option', { name: nombre })
  await user.selectOptions(localidad(), nombre)
  // Las opciones llegan con la consulta de la localidad.
  await screen.findByRole('option', { name: 'Sin institución' })
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(obtenerLocalidades).mockResolvedValue(localidades as never)
  vi.mocked(obtenerEstablecimientos).mockImplementation(async (id: number) => establecimientos[id] ?? [])
  vi.mocked(registrarDescarga).mockResolvedValue(undefined)
  vi.mocked(firmarEnlaces).mockImplementation(async (lista: Recurso[]) =>
    lista.map((r) => ({ recurso: r, url: r.ruta_archivo ? `https://firmada.test/${r.ruta_archivo}` : (r.url as string) })),
  )
})

function abrir(taller = unTaller(), onClose = vi.fn()) {
  const { unmount } = renderConProviders(<DescargaModal taller={taller} open onClose={onClose} />)
  return { taller, onClose, unmount }
}

describe('DescargaModal: formulario', () => {
  it('cerrado no renderiza nada', () => {
    renderConProviders(<DescargaModal taller={unTaller()} open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('los campos van en el orden cargo, localidad, institución', async () => {
    abrir()
    const campos = await screen.findAllByRole('combobox')
    expect(campos).toEqual([cargo(), localidad(), institucion()])
  })

  it('el cargo ofrece los seis cargos', () => {
    abrir()
    const nombres = within(cargo()).getAllByRole('option').map((o) => o.textContent)
    for (const c of ['Director/a', 'Vicedirector/a', 'Secretario/a', 'Docente', 'Supervisor/a', 'Otro']) {
      expect(nombres).toContain(c)
    }
  })

  it('la localidad ofrece las localidades del padrón', async () => {
    abrir()
    expect(await within(localidad()).findByRole('option', { name: 'Oberá' })).toBeInTheDocument()
    expect(within(localidad()).getByRole('option', { name: 'Eldorado' })).toBeInTheDocument()
  })

  it('con "Otro" aparece el cargo a especificar; con otro cargo, no', async () => {
    const user = userEvent.setup()
    abrir()
    expect(screen.queryByLabelText('Especificá tu cargo')).not.toBeInTheDocument()
    await user.selectOptions(cargo(), 'Otro')
    expect(screen.getByLabelText('Especificá tu cargo')).toBeInTheDocument()
    await user.selectOptions(cargo(), 'Docente')
    expect(screen.queryByLabelText('Especificá tu cargo')).not.toBeInTheDocument()
  })

  it('con "Otro" y el cargo vacío no envía y marca el error', async () => {
    const user = userEvent.setup()
    abrir()
    await user.selectOptions(cargo(), 'Otro')
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Sin institución')
    await user.click(enviar())
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(registrarDescarga).not.toHaveBeenCalled()
  })

  it('sin completar el formulario no envía y marca errores', async () => {
    const user = userEvent.setup()
    abrir()
    await user.click(enviar())
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(registrarDescarga).not.toHaveBeenCalled()
  })

  it('lista solo los establecimientos activos de la localidad elegida, más "Otra" y "Sin institución"', async () => {
    const user = userEvent.setup()
    abrir()
    await elegirLocalidad(user, 'Posadas')
    const nombres = within(institucion()).getAllByRole('option').map((o) => o.textContent)
    expect(nombres).toContain('Escuela Activa Uno')
    expect(nombres).not.toContain('Escuela Inactiva')
    expect(nombres).not.toContain('Escuela de Oberá')
    expect(nombres).toContain('Otra')
    expect(nombres).toContain('Sin institución')
  })

  it('cambiar la localidad vacía la institución elegida', async () => {
    const user = userEvent.setup()
    abrir()
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Escuela Activa Uno')
    expect(institucion()).toHaveDisplayValue('Escuela Activa Uno')

    await user.selectOptions(localidad(), 'Oberá')
    await within(institucion()).findByRole('option', { name: 'Escuela de Oberá' })
    expect(institucion()).toHaveValue('')
    expect(within(institucion()).queryByRole('option', { name: 'Escuela Activa Uno' })).not.toBeInTheDocument()
  })

  it('"Otra" pide el nombre de la institución, que es obligatorio', async () => {
    const user = userEvent.setup()
    abrir()
    expect(screen.queryByLabelText('Nombre de la institución')).not.toBeInTheDocument()
    await user.selectOptions(cargo(), 'Docente')
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Otra')
    expect(screen.getByLabelText('Nombre de la institución')).toBeInTheDocument()
    await user.click(enviar())
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(registrarDescarga).not.toHaveBeenCalled()
  })
})

describe('DescargaModal: registro y lista', () => {
  it('con un establecimiento del padrón registra la descarga con los datos elegidos', async () => {
    const user = userEvent.setup()
    const { taller } = abrir()
    await user.selectOptions(cargo(), 'Docente')
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Escuela Activa Uno')
    await user.click(enviar())

    await waitFor(() => expect(registrarDescarga).toHaveBeenCalledTimes(1))
    expect(registrarDescarga).toHaveBeenCalledWith(
      taller.id,
      expect.objectContaining({ cargo: 'Docente', localidad_id: 1, institucion_tipo: 'PADRON', establecimiento_id: 10 }),
    )
  })

  it('con "Otra" registra OTRA con el nombre escrito y sin establecimiento', async () => {
    const user = userEvent.setup()
    const { taller } = abrir()
    await user.selectOptions(cargo(), 'Supervisor/a')
    await elegirLocalidad(user, 'Oberá')
    await user.selectOptions(institucion(), 'Otra')
    await user.type(screen.getByLabelText('Nombre de la institución'), 'Escuela Nueva 9')
    await user.click(enviar())

    await waitFor(() => expect(registrarDescarga).toHaveBeenCalledTimes(1))
    const [id, datos] = vi.mocked(registrarDescarga).mock.calls[0]
    expect(id).toBe(taller.id)
    expect(datos).toMatchObject({ cargo: 'Supervisor/a', localidad_id: 2, institucion_tipo: 'OTRA', institucion_otra: 'Escuela Nueva 9' })
    expect(datos.establecimiento_id ?? null).toBeNull()
  })

  it('con "Otro" cargo registra el cargo escrito', async () => {
    const user = userEvent.setup()
    abrir()
    await user.selectOptions(cargo(), 'Otro')
    await user.type(screen.getByLabelText('Especificá tu cargo'), 'Bibliotecaria')
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Sin institución')
    await user.click(enviar())

    await waitFor(() => expect(registrarDescarga).toHaveBeenCalledTimes(1))
    expect(vi.mocked(registrarDescarga).mock.calls[0][1]).toMatchObject({
      cargo: 'Otro',
      cargo_otro: 'Bibliotecaria',
      institucion_tipo: 'SIN_INSTITUCION',
    })
  })

  it('con "Sin institución" registra SIN_INSTITUCION', async () => {
    const user = userEvent.setup()
    abrir()
    await user.selectOptions(cargo(), 'Director/a')
    await elegirLocalidad(user, 'Eldorado')
    await user.selectOptions(institucion(), 'Sin institución')
    await user.click(enviar())

    await waitFor(() => expect(registrarDescarga).toHaveBeenCalledTimes(1))
    expect(vi.mocked(registrarDescarga).mock.calls[0][1]).toMatchObject({ localidad_id: 3, institucion_tipo: 'SIN_INSTITUCION' })
  })

  async function enviarFormularioValido(user: ReturnType<typeof userEvent.setup>) {
    await user.selectOptions(cargo(), 'Docente')
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Escuela Activa Uno')
    await user.click(enviar())
  }

  it('después de registrar muestra la lista: nombre, tipo y tamaño de cada recurso', async () => {
    const user = userEvent.setup()
    abrir()
    await enviarFormularioValido(user)

    const item = async (nombre: string) => {
      const li = (await screen.findByText(nombre)).closest('li')
      if (!li) throw new Error(`No hay <li> para ${nombre}`)
      return within(li)
    }
    const guia = await item('Guía de huerta')
    expect(guia.getByText(ETIQUETA_TIPO_RECURSO.PDF)).toBeInTheDocument()
    expect(guia.getByText('1,5 MB')).toBeInTheDocument()
    const presentacion = await item('Presentación')
    expect(presentacion.getByText(ETIQUETA_TIPO_RECURSO.PPTX)).toBeInTheDocument()
    expect(presentacion.getByText('2 MB')).toBeInTheDocument()
    expect((await item('Sitio del programa')).getByText(ETIQUETA_TIPO_RECURSO.ENLACE)).toBeInTheDocument()
    expect(screen.queryByLabelText('Cargo')).not.toBeInTheDocument()
  })

  it('la lista muestra el tamaño total de los archivos (los enlaces no suman)', async () => {
    const user = userEvent.setup()
    abrir()
    await enviarFormularioValido(user)
    expect(await screen.findByText(/total/i)).toHaveTextContent('3,5 MB')
  })

  it('los archivos son enlaces al URL firmado y los enlaces externos se abren en otra pestaña', async () => {
    const user = userEvent.setup()
    const { taller } = abrir()
    await enviarFormularioValido(user)

    const archivo = await screen.findByRole('link', { name: /Guía de huerta/ })
    expect(archivo).toHaveAttribute('href', `https://firmada.test/${taller.recurso[0].ruta_archivo}`)
    const externo = screen.getByRole('link', { name: /Sitio del programa/ })
    expect(externo).toHaveAttribute('href', 'https://example.com/programa')
    expect(externo).toHaveAttribute('target', '_blank')
    expect(externo).toHaveAttribute('rel', 'noopener noreferrer')
    expect(firmarEnlaces).toHaveBeenCalledWith(taller.recurso)
  })

  it('un taller ya registrado en la visita va directo a la lista, sin registrar de nuevo', async () => {
    const taller = unTaller()
    marcarTallerRegistrado(taller.id)
    abrir(taller)

    expect(await screen.findByRole('link', { name: /Guía de huerta/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Cargo')).not.toBeInTheDocument()
    expect(registrarDescarga).not.toHaveBeenCalled()
    expect(firmarEnlaces).toHaveBeenCalledTimes(1)
  })

  it('Cerrar llama a onClose', async () => {
    const user = userEvent.setup()
    const { onClose } = abrir()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('DescargaModal: visita', () => {
  it('otro taller abre el formulario precargado con lo que se completó antes, y al confirmarlo se registra', async () => {
    const user = userEvent.setup()
    const { unmount } = abrir()
    await user.selectOptions(cargo(), 'Docente')
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Escuela Activa Uno')
    await user.click(enviar())
    await screen.findByRole('link', { name: /Guía de huerta/ })

    unmount()
    const otro = unTaller()
    abrir(otro)

    expect(await screen.findByLabelText('Cargo')).toHaveDisplayValue('Docente')
    // Las localidades llegan con la consulta (QueryClient nuevo por render): la opción elegida aparece cuando llegan.
    await waitFor(() => expect(localidad()).toHaveDisplayValue('Posadas'))
    await waitFor(() => expect(institucion()).toHaveDisplayValue('Escuela Activa Uno'))

    await user.click(enviar())
    await waitFor(() => expect(registrarDescarga).toHaveBeenCalledTimes(2))
    expect(vi.mocked(registrarDescarga).mock.calls[1][0]).toBe(otro.id)
  })

  it('sin nada recordado el formulario arranca vacío', async () => {
    abrir()
    expect(await screen.findByLabelText('Cargo')).toHaveValue('')
    expect(localidad()).toHaveValue('')
  })
})

describe('DescargaModal: errores', () => {
  async function enviarSinInstitucion(user: ReturnType<typeof userEvent.setup>) {
    await user.selectOptions(cargo(), 'Docente')
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Sin institución')
    await user.click(enviar())
  }

  it('DA003 muestra que el taller ya no está disponible', async () => {
    vi.mocked(registrarDescarga).mockRejectedValue({ code: 'DA003', message: 'x' })
    const user = userEvent.setup()
    abrir()
    await enviarSinInstitucion(user)
    expect(await screen.findByText('Este taller ya no está disponible')).toBeInTheDocument()
    expect(firmarEnlaces).not.toHaveBeenCalled()
  })

  it('DA004 muestra que la institución ya no está disponible y recarga la lista de esa localidad', async () => {
    vi.mocked(registrarDescarga).mockRejectedValue({ code: 'DA004', message: 'x' })
    const user = userEvent.setup()
    abrir()
    await user.selectOptions(cargo(), 'Docente')
    await elegirLocalidad(user, 'Posadas')
    await user.selectOptions(institucion(), 'Escuela Activa Uno')
    const llamadasAntes = vi.mocked(obtenerEstablecimientos).mock.calls.length
    await user.click(enviar())

    expect(await screen.findByText('La institución elegida ya no está disponible')).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(obtenerEstablecimientos).mock.calls.length).toBeGreaterThan(llamadasAntes))
    expect(vi.mocked(obtenerEstablecimientos).mock.calls.at(-1)?.[0]).toBe(1)
  })

  it('si falla la firma después de registrar muestra "Reintentar", que solo vuelve a firmar', async () => {
    vi.mocked(firmarEnlaces).mockRejectedValueOnce(new Error('firma'))
    const user = userEvent.setup()
    abrir()
    await enviarSinInstitucion(user)

    const reintentar = await screen.findByRole('button', { name: 'Reintentar' })
    expect(registrarDescarga).toHaveBeenCalledTimes(1)

    await user.click(reintentar)
    expect(await screen.findByRole('link', { name: /Guía de huerta/ })).toBeInTheDocument()
    expect(registrarDescarga).toHaveBeenCalledTimes(1)
    expect(firmarEnlaces).toHaveBeenCalledTimes(2)
  })
})
