import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerCategorias } from '@/features/talleres/consultas'
import type { Categoria } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { NivelesPage } from './NivelesPage'

vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NivelesPage', () => {
  it('lista los 5 niveles y cada uno lleva a /admin/talleres/:nivelId', () => {
    vi.mocked(obtenerCategorias).mockResolvedValue([])
    renderConProviders(<NivelesPage />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
    expect(screen.getByRole('link', { name: /Formación profesional/ })).toHaveAttribute(
      'href',
      '/admin/talleres/5',
    )
  })

  it('cuenta solo las categorías activas de cada nivel', async () => {
    vi.mocked(obtenerCategorias).mockResolvedValue([
      categoria(1, 3, 'Ciencia', true),
      categoria(2, 3, 'Salud', false),
      categoria(3, 3, 'Lectura', true),
      categoria(4, 2, 'Huerta', true),
    ])
    renderConProviders(<NivelesPage />)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Secundario/ })).toHaveTextContent('2 categorías'),
    )
    expect(screen.getByRole('link', { name: /Primario/ })).toHaveTextContent('1 categorías')
    expect(screen.getByRole('link', { name: /Inicial/ })).toHaveTextContent('0 categorías')
  })

  it('si la carga falla muestra un alert con "Reintentar" que vuelve a consultar', async () => {
    vi.mocked(obtenerCategorias).mockRejectedValueOnce(new Error('sin red'))
    vi.mocked(obtenerCategorias).mockResolvedValue([categoria(1, 3, 'Ciencia', true)])
    renderConProviders(<NivelesPage />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Secundario/ })).toHaveTextContent('1 categorías'),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
