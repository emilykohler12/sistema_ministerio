import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearWrapperQuery } from '@/test/utils'
import { obtenerCategorias } from '../consultas'
import type { Categoria } from '../types'
import { useCategoriaDeRuta } from './useCategoriaDeRuta'

vi.mock('../consultas', () => ({
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerCategorias).mockResolvedValue([ciencia])
})

describe('useCategoriaDeRuta', () => {
  it('pasa de cargando a ok con la categoría del nivel de la URL', async () => {
    const { result } = renderHook(() => useCategoriaDeRuta('3', '7'), { wrapper: crearWrapperQuery() })
    expect(result.current.estado).toBe('cargando')
    await waitFor(() => expect(result.current).toEqual({ estado: 'ok', categoria: ciencia }))
  })

  it('una categoría de otro nivel es "no-encontrada"', async () => {
    const { result } = renderHook(() => useCategoriaDeRuta('1', '7'), { wrapper: crearWrapperQuery() })
    await waitFor(() => expect(result.current.estado).toBe('no-encontrada'))
  })

  it('un id inexistente es "no-encontrada"', async () => {
    const { result } = renderHook(() => useCategoriaDeRuta('3', '999'), { wrapper: crearWrapperQuery() })
    await waitFor(() => expect(result.current.estado).toBe('no-encontrada'))
  })

  it('un id inválido o ausente es "no-encontrada" sin esperar la carga', () => {
    const a = renderHook(() => useCategoriaDeRuta('3', 'abc'), { wrapper: crearWrapperQuery() })
    expect(a.result.current.estado).toBe('no-encontrada')
    const b = renderHook(() => useCategoriaDeRuta('x', '7'), { wrapper: crearWrapperQuery() })
    expect(b.result.current.estado).toBe('no-encontrada')
    const c = renderHook(() => useCategoriaDeRuta('3', undefined), { wrapper: crearWrapperQuery() })
    expect(c.result.current.estado).toBe('no-encontrada')
  })

  it('si la carga falla da "error" y reintentar vuelve a consultar', async () => {
    vi.mocked(obtenerCategorias).mockRejectedValueOnce(new Error('sin red'))
    const { result } = renderHook(() => useCategoriaDeRuta('3', '7'), { wrapper: crearWrapperQuery() })
    await waitFor(() => expect(result.current.estado).toBe('error'))
    if (result.current.estado === 'error') result.current.reintentar()
    await waitFor(() => expect(result.current).toEqual({ estado: 'ok', categoria: ciencia }))
    expect(obtenerCategorias).toHaveBeenCalledTimes(2)
  })
})
