import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { actualizarCategoria, crearCategoria, obtenerCategorias } from '../consultas'
import type { Categoria } from '../types'
import { useActualizarCategoria, useCategorias, useCrearCategoria } from './useCategorias'

/*
 * Contrato de consultas.ts (decisión 0012): lanzan ante cualquier error.
 *   obtenerCategorias(): Promise<Categoria[]>
 *   crearCategoria(nueva: CategoriaNueva): Promise<Categoria>
 *   actualizarCategoria(id: number, cambios: CategoriaCambios): Promise<Categoria>
 * Todos los hooks comparten la clave ['categorias'] y filtran con `select`.
 */
vi.mock('../consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
}))

function categoria(id: number, nivel_id: number, nombre: string, activo = true): Categoria {
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

const todas = [categoria(1, 1, 'Lectura'), categoria(2, 3, 'Salud', false), categoria(3, 3, 'Ciencia')]

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerCategorias).mockResolvedValue(todas)
})

describe('useCategorias', () => {
  it('sin nivel devuelve todas las que resuelve obtenerCategorias', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useCategorias(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(todas)
  })

  it('con nivelId filtra por nivel_id', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useCategorias(3), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((c) => c.id)).toEqual([2, 3])
  })

  it('guarda la lista completa bajo la clave ["categorias"], aunque se filtre', async () => {
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useCategorias(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryData(['categorias'])).toEqual(todas)
  })

  it('con dos niveles distintos consulta una sola vez', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => ({ a: useCategorias(1), b: useCategorias(3) }), { wrapper })
    await waitFor(() => expect(result.current.a.isSuccess && result.current.b.isSuccess).toBe(true))
    expect(obtenerCategorias).toHaveBeenCalledTimes(1)
  })
})

describe('useCrearCategoria', () => {
  it('llama a crearCategoria con la categoría nueva e invalida ["categorias"] (vuelve a consultar)', async () => {
    const nueva = { nivel_id: 1, nombre: 'Huerta', descripcion: '' }
    vi.mocked(crearCategoria).mockResolvedValue(categoria(4, 1, 'Huerta'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => ({ lista: useCategorias(), crear: useCrearCategoria() }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true))
    expect(obtenerCategorias).toHaveBeenCalledTimes(1)

    result.current.crear.mutate(nueva)

    await waitFor(() => expect(result.current.crear.isSuccess).toBe(true))
    expect(vi.mocked(crearCategoria).mock.calls[0][0]).toEqual(nueva)
    await waitFor(() => expect(obtenerCategorias).toHaveBeenCalledTimes(2))
  })

  it('si crearCategoria rechaza, la mutation queda en error', async () => {
    vi.mocked(crearCategoria).mockRejectedValue({ code: '23505' })
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useCrearCategoria(), { wrapper })
    result.current.mutate({ nivel_id: 1, nombre: 'Lectura', descripcion: '' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useActualizarCategoria', () => {
  it('llama a actualizarCategoria(id, cambios) e invalida ["categorias"] (vuelve a consultar)', async () => {
    vi.mocked(actualizarCategoria).mockResolvedValue(categoria(2, 3, 'Salud', true))
    const { wrapper } = crearContexto()
    const { result } = renderHook(
      () => ({ lista: useCategorias(), actualizar: useActualizarCategoria() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true))

    result.current.actualizar.mutate({ id: 2, cambios: { activo: true } })

    await waitFor(() => expect(result.current.actualizar.isSuccess).toBe(true))
    expect(actualizarCategoria).toHaveBeenCalledWith(2, { activo: true })
    await waitFor(() => expect(obtenerCategorias).toHaveBeenCalledTimes(2))
  })
})
