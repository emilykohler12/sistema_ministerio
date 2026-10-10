import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { actualizarCategoria, obtenerCategorias, obtenerTalleres } from '@/features/talleres/consultas'
import type { Categoria, Taller } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { CategoriasPage } from './CategoriasPage'

/*
 * Contrato de consultas: ver useCategorias.test.ts. Textos asumidos: marca "Inactiva", botones
 * "Dar de baja" (abre un diálogo de confirmación con role="dialog") y "Reactivar". La baja y la
 * reactivación llaman a actualizarCategoria(id, { activo }). No hay "Eliminar" (no hay borrado físico).
 */
vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

function categoria(id: number, nivel_id: number, nombre: string, activo: boolean): Categoria {
  return {
    id,
    nivel_id,
    nombre,
    descripcion: '',
    activo,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
  }
}

function taller(id: number, categoria_id: number, estado: Taller['estado']): Taller {
  return {
    id,
    categoria_id,
    nombre: `Taller ${id}`,
    descripcion: 'Desc',
    estado,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    categoria: { nivel_id: 3 },
    destinatario: [],
    etiqueta: [],
    recurso: [],
  }
}

const todas = [
  categoria(1, 3, 'Ciencia', true),
  categoria(2, 3, 'Salud', false),
  categoria(3, 2, 'Lectura', true),
]

function renderPagina(ruta = '/admin/talleres/3') {
  return renderConProviders(
    <Routes>
      <Route path="/admin/talleres/:nivelId" element={<CategoriasPage />} />
    </Routes>,
    { ruta },
  )
}

const tarjeta = (nombre: string) => {
  const el = screen.getByText(nombre).closest('div')
  if (!el) throw new Error(`sin tarjeta para ${nombre}`)
  return within(el)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerCategorias).mockResolvedValue(todas)
  vi.mocked(obtenerTalleres).mockResolvedValue([])
})

describe('CategoriasPage', () => {
  it('lista solo las categorías del nivel de la URL, incluidas las inactivas', async () => {
    renderPagina()
    expect(await screen.findByText('Ciencia')).toBeInTheDocument()
    expect(screen.getByText('Salud')).toBeInTheDocument()
    expect(screen.queryByText('Lectura')).not.toBeInTheDocument()
  })

  it('marca como "Inactiva" solo a las categorías dadas de baja', async () => {
    renderPagina()
    await screen.findByText('Ciencia')
    expect(tarjeta('Salud').getByText('Inactiva')).toBeInTheDocument()
    expect(tarjeta('Ciencia').queryByText('Inactiva')).not.toBeInTheDocument()
  })

  it('"Dar de baja" pide confirmación y recién al confirmar llama a actualizarCategoria(id, { activo: false })', async () => {
    vi.mocked(actualizarCategoria).mockResolvedValue({ ...todas[0], activo: false })
    renderPagina()
    await screen.findByText('Ciencia')

    await userEvent.click(tarjeta('Ciencia').getByRole('button', { name: 'Dar de baja' }))
    const dialogo = await screen.findByRole('dialog')
    expect(actualizarCategoria).not.toHaveBeenCalled()

    const confirmar = within(dialogo)
      .getAllByRole('button')
      .find((b) => !/cerrar|cancelar/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))
    expect(confirmar).toBeDefined()
    await userEvent.click(confirmar!)

    await waitFor(() => expect(actualizarCategoria).toHaveBeenCalledTimes(1))
    expect(actualizarCategoria).toHaveBeenCalledWith(1, { activo: false })
  })

  it('cancelar la confirmación no da de baja', async () => {
    renderPagina()
    await screen.findByText('Ciencia')
    await userEvent.click(tarjeta('Ciencia').getByRole('button', { name: 'Dar de baja' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(actualizarCategoria).not.toHaveBeenCalled()
  })

  it('una categoría inactiva ofrece "Reactivar" y llama a actualizarCategoria(id, { activo: true })', async () => {
    vi.mocked(actualizarCategoria).mockResolvedValue({ ...todas[1], activo: true })
    renderPagina()
    await screen.findByText('Salud')

    expect(tarjeta('Salud').queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument()
    await userEvent.click(tarjeta('Salud').getByRole('button', { name: 'Reactivar' }))

    await waitFor(() => expect(actualizarCategoria).toHaveBeenCalledTimes(1))
    expect(actualizarCategoria).toHaveBeenCalledWith(2, { activo: true })
  })

  it('una categoría activa no ofrece "Reactivar" y ninguna ofrece "Eliminar"', async () => {
    renderPagina()
    await screen.findByText('Ciencia')
    expect(tarjeta('Ciencia').queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
  })

  it('si :nivelId no es un número válido muestra "no encontrado"', () => {
    renderPagina('/admin/talleres/abc')
    expect(screen.getByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('si :nivelId es un número que no es un nivel muestra "no encontrado"', () => {
    renderPagina('/admin/talleres/99')
    expect(screen.getByText(/no encontrad/i)).toBeInTheDocument()
  })
})

describe('CategoriasPage: errores al actualizar', () => {
  it('si la baja falla muestra un aviso (alert) y la categoría sigue activa', async () => {
    vi.mocked(actualizarCategoria).mockRejectedValue(new Error('sin red'))
    renderPagina()
    await screen.findByText('Ciencia')

    await userEvent.click(tarjeta('Ciencia').getByRole('button', { name: 'Dar de baja' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getAllByRole('button').at(-1)!)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos/i)
    expect(tarjeta('Ciencia').queryByText('Inactiva')).not.toBeInTheDocument()
  })

  it('si la reactivación falla muestra un aviso (alert) y la categoría sigue inactiva', async () => {
    vi.mocked(actualizarCategoria).mockRejectedValue(new Error('sin red'))
    renderPagina()
    await screen.findByText('Salud')

    await userEvent.click(tarjeta('Salud').getByRole('button', { name: 'Reactivar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos/i)
    expect(tarjeta('Salud').getByText('Inactiva')).toBeInTheDocument()
  })
})

describe('CategoriasPage: talleres de cada categoría', () => {
  it('cuenta solo los talleres no inactivos (borrador y publicado) de cada categoría', async () => {
    vi.mocked(obtenerTalleres).mockResolvedValue([
      taller(1, 1, 'PUBLICADO'),
      taller(2, 1, 'BORRADOR'),
      taller(3, 1, 'INACTIVO'),
      taller(4, 3, 'PUBLICADO'),
    ])
    renderPagina()
    await screen.findByText('Ciencia')
    await waitFor(() => expect(tarjeta('Ciencia').getByText('2 talleres')).toBeInTheDocument())
    expect(tarjeta('Salud').getByText('0 talleres')).toBeInTheDocument()
  })

  it('si la baja falla con DA001 muestra cuántos talleres en borrador o publicados tiene', async () => {
    vi.mocked(actualizarCategoria).mockRejectedValue({ code: 'DA001', details: '3', message: 'tiene talleres' })
    renderPagina()
    await screen.findByText('Ciencia')

    await userEvent.click(tarjeta('Ciencia').getByRole('button', { name: 'Dar de baja' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getAllByRole('button').at(-1)!)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede dar de baja: tiene 3 talleres en borrador o publicados',
    )
    expect(tarjeta('Ciencia').queryByText('Inactiva')).not.toBeInTheDocument()
  })

  it('si falla la carga de talleres no muestra "0 talleres" y ofrece reintentar', async () => {
    vi.mocked(obtenerTalleres).mockRejectedValueOnce(new Error('sin red'))
    renderPagina()
    await screen.findByText('Ciencia')
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos cargar los talleres/i)
    expect(screen.queryByText(/\d+ talleres?$/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(tarjeta('Ciencia').getByText('0 talleres')).toBeInTheDocument())
  })
})
