import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerCategorias } from '@/features/talleres/consultas'
import type { Categoria } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { TalleresListPage } from './TalleresListPage'

vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
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
      <Route path="/admin/talleres/:nivelId/:categoriaId" element={<TalleresListPage />} />
    </Routes>,
    { ruta },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerCategorias).mockResolvedValue([ciencia])
})

describe('TalleresListPage', () => {
  it('muestra la categoría de la URL', async () => {
    renderPagina('/admin/talleres/3/7')
    expect(await screen.findByRole('heading', { name: 'Ciencia' })).toBeInTheDocument()
  })

  it('con un :categoriaId inválido muestra "no encontrado"', () => {
    renderPagina('/admin/talleres/3/abc')
    expect(screen.getByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('con un :nivelId inválido muestra "no encontrado"', () => {
    renderPagina('/admin/talleres/abc/7')
    expect(screen.getByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('con una categoría que no existe muestra "no encontrado"', async () => {
    renderPagina('/admin/talleres/3/999')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('con una categoría de otro nivel muestra "no encontrado"', async () => {
    renderPagina('/admin/talleres/1/7')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ciencia' })).not.toBeInTheDocument()
  })

  it('si la carga falla muestra un alert con "Reintentar" (no "Cargando..."); reintentar lo recupera', async () => {
    vi.mocked(obtenerCategorias).mockRejectedValueOnce(new Error('sin red'))
    renderPagina('/admin/talleres/3/7')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Ciencia' })).toBeInTheDocument()
  })
})
