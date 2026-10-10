import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cambiarEstadoTaller, obtenerCategorias, obtenerTalleres } from '@/features/talleres/consultas'
import type { Categoria, Taller } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { TalleresListPage } from './TalleresListPage'

/*
 * Contrato de consultas: ver useTalleres.test.ts. Textos asumidos: columnas "Nombre", "Destinatarios",
 * "Estado" y "Última modificación"; estados "Borrador" / "Publicado" / "Inactivo"; acciones "Editar",
 * "Dar de baja" (abre un diálogo de confirmación) y "Reactivar" (sin confirmación). La baja llama a
 * cambiarEstadoTaller(id, 'INACTIVO') y la reactivación a cambiarEstadoTaller(id, 'BORRADOR').
 */
vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

const DA002 = 'La categoría está dada de baja: reactivala primero'

const ciencia: Categoria = {
  id: 7,
  nivel_id: 3,
  nombre: 'Ciencia',
  descripcion: '',
  activo: true,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
}

function taller(id: number, nombre: string, estado: Taller['estado'], categoria_id = 7): Taller {
  return {
    id,
    categoria_id,
    nombre,
    descripcion: 'Desc',
    estado,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-11T00:00:00Z',
    categoria: { nivel_id: 3 },
    destinatario: [
      { id: 1, nombre: 'Directivos' },
      { id: 4, nombre: 'Docentes' },
    ],
    etiqueta: [],
  }
}

const talleres = [
  taller(1, 'Huerta escolar', 'PUBLICADO'),
  taller(2, 'Borrador de robótica', 'BORRADOR'),
  taller(3, 'Ajedrez viejo', 'INACTIVO'),
  taller(4, 'De otra categoría', 'PUBLICADO', 8),
]

function renderPagina(ruta: string) {
  return renderConProviders(
    <Routes>
      <Route path="/admin/talleres/:nivelId/:categoriaId" element={<TalleresListPage />} />
    </Routes>,
    { ruta },
  )
}

const fila = (nombre: string) => within(screen.getByRole('row', { name: new RegExp(nombre) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerCategorias).mockResolvedValue([ciencia])
  vi.mocked(obtenerTalleres).mockResolvedValue(talleres)
})

describe('TalleresListPage: categoría de la URL', () => {
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

describe('TalleresListPage: lista', () => {
  it('muestra las columnas nombre, destinatarios, estado y última modificación', async () => {
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Huerta escolar')
    for (const col of ['Nombre', 'Destinatarios', 'Estado', 'Última modificación']) {
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument()
    }
    expect(screen.queryByRole('columnheader', { name: /descargas|recursos|fecha$/i })).not.toBeInTheDocument()
  })

  it('lista solo los talleres de la categoría, incluidos borradores e inactivos', async () => {
    renderPagina('/admin/talleres/3/7')
    expect(await screen.findByText('Huerta escolar')).toBeInTheDocument()
    expect(screen.getByText('Borrador de robótica')).toBeInTheDocument()
    expect(screen.getByText('Ajedrez viejo')).toBeInTheDocument()
    expect(screen.queryByText('De otra categoría')).not.toBeInTheDocument()
  })

  it('muestra los destinatarios por nombre y el estado de cada taller', async () => {
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Huerta escolar')
    expect(fila('Huerta escolar').getByText(/Directivos, Docentes/)).toBeInTheDocument()
    expect(fila('Huerta escolar').getByText('Publicado')).toBeInTheDocument()
    expect(fila('Borrador de robótica').getByText('Borrador')).toBeInTheDocument()
    expect(fila('Ajedrez viejo').getByText('Inactivo')).toBeInTheDocument()
  })

  it('sin talleres en la categoría muestra el estado vacío', async () => {
    vi.mocked(obtenerTalleres).mockResolvedValue([])
    renderPagina('/admin/talleres/3/7')
    expect(await screen.findByText(/todavía no hay talleres/i)).toBeInTheDocument()
  })
})

describe('TalleresListPage: baja y reactivación', () => {
  it('"Dar de baja" pide confirmación y recién al confirmar llama a cambiarEstadoTaller(id, "INACTIVO")', async () => {
    vi.mocked(cambiarEstadoTaller).mockResolvedValue(undefined)
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Huerta escolar')

    await userEvent.click(fila('Huerta escolar').getByRole('button', { name: 'Dar de baja' }))
    const dialogo = await screen.findByRole('dialog')
    expect(cambiarEstadoTaller).not.toHaveBeenCalled()

    const confirmar = within(dialogo)
      .getAllByRole('button')
      .find((b) => !/cerrar|cancelar/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))
    expect(confirmar).toBeDefined()
    await userEvent.click(confirmar!)

    await waitFor(() => expect(cambiarEstadoTaller).toHaveBeenCalledTimes(1))
    expect(cambiarEstadoTaller).toHaveBeenCalledWith(1, 'INACTIVO')
  })

  it('cancelar la confirmación no da de baja', async () => {
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Huerta escolar')
    await userEvent.click(fila('Huerta escolar').getByRole('button', { name: 'Dar de baja' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(cambiarEstadoTaller).not.toHaveBeenCalled()
  })

  it('un borrador también se puede dar de baja', async () => {
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Borrador de robótica')
    expect(fila('Borrador de robótica').getByRole('button', { name: 'Dar de baja' })).toBeInTheDocument()
  })

  it('un taller inactivo ofrece "Reactivar" (no "Dar de baja") y llama a cambiarEstadoTaller(id, "BORRADOR")', async () => {
    vi.mocked(cambiarEstadoTaller).mockResolvedValue(undefined)
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Ajedrez viejo')

    expect(fila('Ajedrez viejo').queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument()
    await userEvent.click(fila('Ajedrez viejo').getByRole('button', { name: 'Reactivar' }))

    await waitFor(() => expect(cambiarEstadoTaller).toHaveBeenCalledTimes(1))
    expect(cambiarEstadoTaller).toHaveBeenCalledWith(3, 'BORRADOR')
  })

  it('los talleres activos no ofrecen "Reactivar" y ninguno ofrece "Eliminar"', async () => {
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Huerta escolar')
    expect(fila('Huerta escolar').queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
  })

  it('si reactivar falla con DA002 muestra "La categoría está dada de baja: reactivala primero"', async () => {
    vi.mocked(cambiarEstadoTaller).mockRejectedValue({ code: 'DA002', message: 'inactiva' })
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Ajedrez viejo')
    await userEvent.click(fila('Ajedrez viejo').getByRole('button', { name: 'Reactivar' }))

    expect(await screen.findByText(DA002)).toBeInTheDocument()
    expect(fila('Ajedrez viejo').getByText('Inactivo')).toBeInTheDocument()
  })

  it('si la baja falla con otro error muestra un aviso genérico y el taller sigue publicado', async () => {
    vi.mocked(cambiarEstadoTaller).mockRejectedValue(new Error('sin red'))
    renderPagina('/admin/talleres/3/7')
    await screen.findByText('Huerta escolar')
    await userEvent.click(fila('Huerta escolar').getByRole('button', { name: 'Dar de baja' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getAllByRole('button').at(-1)!)

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/no pudimos/i)
    expect(alerta).not.toHaveTextContent('dada de baja')
    expect(fila('Huerta escolar').getByText('Publicado')).toBeInTheDocument()
  })
})
