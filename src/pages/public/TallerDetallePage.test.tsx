import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerTalleres } from '@/features/talleres/consultas'
import type { Taller } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { TallerDetallePage } from './TallerDetallePage'

vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

function taller(id: number, nombre: string, p: Partial<Taller> = {}): Taller {
  return {
    id,
    categoria_id: 7,
    nombre,
    descripcion: '',
    estado: 'PUBLICADO',
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    categoria: { nivel_id: 3 },
    destinatario: [],
    etiqueta: [],
    ...p,
  }
}

const datos = [
  taller(1, 'Cuidados en redes', {
    descripcion: 'Convivencia digital en la escuela',
    destinatario: [{ id: 1, nombre: 'Directivos' }],
    etiqueta: [{ id: 1, nombre: 'Ciberseguridad' }],
  }),
  taller(2, 'Borrador secreto', { estado: 'BORRADOR' }),
  taller(3, 'Taller dado de baja', { estado: 'INACTIVO' }),
  taller(4, 'Similar publicado'),
  taller(5, 'Similar en borrador', { estado: 'BORRADOR' }),
  taller(6, 'De otra categoría', { categoria_id: 8 }),
]

function renderPagina(id: string) {
  return renderConProviders(
    <Routes>
      <Route path="/talleres/:id" element={<TallerDetallePage />} />
    </Routes>,
    { ruta: `/talleres/${id}` },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerTalleres).mockResolvedValue(datos)
})

describe('TallerDetallePage', () => {
  it('un taller publicado muestra nombre, nivel, descripción, destinatarios y etiquetas', async () => {
    renderPagina('1')
    expect(await screen.findByRole('heading', { name: 'Cuidados en redes' })).toBeInTheDocument()
    expect(screen.getByText('Convivencia digital en la escuela')).toBeInTheDocument()
    expect(screen.getByText(/secundario/i)).toBeInTheDocument()
    expect(screen.getByText('Directivos')).toBeInTheDocument()
    expect(screen.getByText('Ciberseguridad')).toBeInTheDocument()
  })

  it('no ofrece descarga ni vista previa (todavía no hay recursos)', async () => {
    renderPagina('1')
    await screen.findByRole('heading', { name: 'Cuidados en redes' })
    expect(screen.queryByRole('button', { name: /descargar/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/vista previa/i)).not.toBeInTheDocument()
  })

  it('un borrador muestra "no encontrado", no sus datos', async () => {
    renderPagina('2')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByText('Borrador secreto')).not.toBeInTheDocument()
  })

  it('un taller inactivo muestra "no encontrado"', async () => {
    renderPagina('3')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByText('Taller dado de baja')).not.toBeInTheDocument()
  })

  it('un id inexistente muestra "no encontrado"', async () => {
    renderPagina('999')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('un id inválido muestra "no encontrado"', async () => {
    renderPagina('abc')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('si la carga falla muestra un alert con "Reintentar", no "no encontrado"; reintentar lo recupera', async () => {
    vi.mocked(obtenerTalleres).mockRejectedValueOnce(new Error('sin red'))
    renderPagina('1')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/no encontrad/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Cuidados en redes' })).toBeInTheDocument()
  })

  it('los similares son los publicados de la misma categoría, sin el propio taller ni borradores', async () => {
    renderPagina('1')
    await screen.findByRole('heading', { name: 'Cuidados en redes' })
    expect(await screen.findByText('Similar publicado')).toBeInTheDocument()
    expect(screen.queryByText('Similar en borrador')).not.toBeInTheDocument()
    expect(screen.queryByText('De otra categoría')).not.toBeInTheDocument()
    expect(screen.getAllByText('Cuidados en redes')).toHaveLength(1) // solo el heading
  })
})
