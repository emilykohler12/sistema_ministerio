import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarCategoria,
  crearCategoria,
  obtenerCategorias,
} from '@/features/talleres/consultas'
import type { Categoria } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { CategoriaFormPage } from './CategoriaFormPage'

/*
 * Contrato de consultas: ver useCategorias.test.ts. Se mockea solo `consultas`; `errores.ts`
 * (esNombreDuplicado) es el real.
 * Textos asumidos: etiquetas "Nombre de la categoría" y "Descripción (opcional)", botones
 * "Crear categoría" / "Guardar cambios" / "Reintentar". Los errores (validación, duplicado,
 * genérico y de carga) salen en elementos con role="alert". Al guardar se vuelve a
 * /admin/talleres/:nivelId. No hay select de nivel: el nivel sale de la URL.
 */
vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
}))

const DUPLICADO = 'Ya existe una categoría con ese nombre en este nivel (puede estar dada de baja)'

const existente: Categoria = {
  id: 7,
  nivel_id: 3,
  nombre: 'Salud mental',
  descripcion: 'Original',
  activo: true,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
}

function renderPagina(ruta: string) {
  return renderConProviders(
    <Routes>
      <Route path="/admin/talleres/:nivelId/nueva-categoria" element={<CategoriaFormPage />} />
      <Route path="/admin/talleres/:nivelId" element={<p>Lista de categorías</p>} />
    </Routes>,
    { ruta },
  )
}

const nombre = () => screen.getByLabelText('Nombre de la categoría')
const descripcion = () => screen.getByLabelText('Descripción (opcional)')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerCategorias).mockResolvedValue([existente])
})

describe('CategoriaFormPage: alta', () => {
  it('crea la categoría con el nivel de la URL, el nombre sin espacios en los bordes, y vuelve a la lista', async () => {
    vi.mocked(crearCategoria).mockResolvedValue({ ...existente, id: 8 })
    renderPagina('/admin/talleres/3/nueva-categoria')
    await userEvent.type(nombre(), '  Ciencia  ')
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }))

    await waitFor(() => expect(crearCategoria).toHaveBeenCalledTimes(1))
    expect(vi.mocked(crearCategoria).mock.calls[0][0]).toMatchObject({
      nivel_id: 3,
      nombre: 'Ciencia',
    })
    expect(await screen.findByText('Lista de categorías')).toBeInTheDocument()
  })

  it('no ofrece un select de nivel', () => {
    renderPagina('/admin/talleres/3/nueva-categoria')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('con el nombre repetido en el nivel muestra el mensaje de duplicado y no navega', async () => {
    vi.mocked(crearCategoria).mockRejectedValue({ code: '23505', message: 'duplicate key' })
    renderPagina('/admin/talleres/3/nueva-categoria')
    await userEvent.type(nombre(), 'salud MENTAL')
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }))

    expect(await screen.findByText(DUPLICADO)).toBeInTheDocument()
    expect(screen.queryByText('Lista de categorías')).not.toBeInTheDocument()
  })

  it('ante cualquier otro error muestra un mensaje genérico, no el de duplicado', async () => {
    vi.mocked(crearCategoria).mockRejectedValue(new Error('sin red'))
    renderPagina('/admin/talleres/3/nueva-categoria')
    await userEvent.type(nombre(), 'Ciencia')
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).not.toHaveTextContent('Ya existe')
    expect(screen.queryByText('Lista de categorías')).not.toBeInTheDocument()
  })

  it('con el nombre en blanco muestra un error de validación y no guarda', async () => {
    renderPagina('/admin/talleres/3/nueva-categoria')
    await userEvent.type(nombre(), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(crearCategoria).not.toHaveBeenCalled()
  })

  it('con un nombre de más de 150 caracteres muestra un error y no guarda', async () => {
    renderPagina('/admin/talleres/3/nueva-categoria')
    await userEvent.click(nombre())
    await userEvent.paste('a'.repeat(151))
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(crearCategoria).not.toHaveBeenCalled()
  })

  it('acepta un nombre de exactamente 150 caracteres', async () => {
    vi.mocked(crearCategoria).mockResolvedValue({ ...existente, id: 8 })
    renderPagina('/admin/talleres/3/nueva-categoria')
    await userEvent.click(nombre())
    await userEvent.paste('a'.repeat(150))
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }))
    await waitFor(() => expect(crearCategoria).toHaveBeenCalledTimes(1))
  })

  it('si :nivelId no es un número válido o no existe muestra "no encontrado"', () => {
    renderPagina('/admin/talleres/abc/nueva-categoria')
    expect(screen.getByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre de la categoría')).not.toBeInTheDocument()
  })

  it('si :nivelId es un número que no es un nivel (99) muestra "no encontrado"', () => {
    renderPagina('/admin/talleres/99/nueva-categoria')
    expect(screen.getByText(/no encontrad/i)).toBeInTheDocument()
  })
})

describe('CategoriaFormPage: edición', () => {
  it('carga los valores y guarda solo nombre y descripción, sin nivel_id', async () => {
    vi.mocked(actualizarCategoria).mockResolvedValue(existente)
    renderPagina('/admin/talleres/3/nueva-categoria?editar=7')
    await waitFor(() => expect(nombre()).toHaveValue('Salud mental'))
    expect(descripcion()).toHaveValue('Original')

    await userEvent.clear(descripcion())
    await userEvent.type(descripcion(), 'Nueva')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(actualizarCategoria).toHaveBeenCalledTimes(1))
    const [id, cambios] = vi.mocked(actualizarCategoria).mock.calls[0]
    expect(id).toBe(7)
    expect(cambios).toEqual({ nombre: 'Salud mental', descripcion: 'Nueva' })
    expect(cambios).not.toHaveProperty('nivel_id')
    expect(crearCategoria).not.toHaveBeenCalled()
    expect(await screen.findByText('Lista de categorías')).toBeInTheDocument()
  })

  it('con el nombre repetido al editar muestra el mensaje de duplicado', async () => {
    vi.mocked(actualizarCategoria).mockRejectedValue({ code: '23505' })
    renderPagina('/admin/talleres/3/nueva-categoria?editar=7')
    await waitFor(() => expect(nombre()).toHaveValue('Salud mental'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(DUPLICADO)).toBeInTheDocument()
  })

  it('si la carga falla muestra un alert con "Reintentar" y no el formulario; reintentar lo recupera', async () => {
    vi.mocked(obtenerCategorias).mockRejectedValueOnce(new Error('sin red'))
    renderPagina('/admin/talleres/3/nueva-categoria?editar=7')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre de la categoría')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(nombre()).toHaveValue('Salud mental'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si la categoría a editar no existe no muestra el formulario vacío', async () => {
    renderPagina('/admin/talleres/3/nueva-categoria?editar=999')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })
})
