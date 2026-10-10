import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerCategorias } from '@/features/talleres/consultas'
import type { Categoria } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { TallerFormPage } from './TallerFormPage'

vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
}))
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 'u1', email: 'admin@dam.local' } }),
}))

const ciencia: Categoria = {
  id: 7,
  nivel_id: 3,
  nombre: 'Ciencia',
  descripcion: '',
  activo: true,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
}

function renderPagina(ruta: string) {
  return renderConProviders(
    <Routes>
      <Route path="/admin/talleres/:nivelId/:categoriaId/nuevo" element={<TallerFormPage />} />
    </Routes>,
    { ruta },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerCategorias).mockResolvedValue([ciencia])
})

describe('TallerFormPage', () => {
  it('con la categoría de la URL muestra el formulario', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    expect(await screen.findByRole('heading', { name: 'Nuevo Taller' })).toBeInTheDocument()
  })

  it('con un :categoriaId inválido muestra "no encontrado"', () => {
    renderPagina('/admin/talleres/3/abc/nuevo')
    expect(screen.getByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('con una categoría de otro nivel muestra "no encontrado", no el formulario', async () => {
    renderPagina('/admin/talleres/1/7/nuevo')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nuevo Taller' })).not.toBeInTheDocument()
  })

  it('si la carga de la categoría falla muestra un alert con "Reintentar"', async () => {
    vi.mocked(obtenerCategorias).mockRejectedValueOnce(new Error('sin red'))
    renderPagina('/admin/talleres/3/7/nuevo')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nuevo Taller' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Nuevo Taller' })).toBeInTheDocument()
  })
})
