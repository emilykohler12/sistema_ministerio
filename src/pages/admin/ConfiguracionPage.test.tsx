import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guardarConfiguracion, obtenerConfiguracion } from '@/features/configuracion/consultas'
import type { Configuracion } from '@/features/configuracion/types'
import { renderConProviders } from '@/test/utils'
import { ConfiguracionPage } from './ConfiguracionPage'

/*
 * Contrato de consultas: ver useConfiguracion.test.ts. ConfiguracionPage no usa useAuth,
 * así que no se monta AuthProvider.
 * Textos asumidos: etiquetas "Nombre de la institución" y "Correo de contacto", botón
 * "Guardar cambios", éxito "Cambios guardados". Los errores (de validación y de guardado)
 * se muestran en elementos con role="alert". No hay control para cambiar el logo.
 */
vi.mock('@/features/configuracion/consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
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

  it('no ofrece ningún control para cambiar el logo', async () => {
    await renderPagina()
    expect(screen.queryByLabelText(/logo/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /logo/i })).not.toBeInTheDocument()
  })
})
