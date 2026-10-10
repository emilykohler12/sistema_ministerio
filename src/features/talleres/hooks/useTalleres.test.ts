import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { cambiarEstadoTaller, guardarTaller, obtenerTalleres } from '../consultas'
import type { Taller } from '../types'
import {
  useCambiarEstadoTaller,
  useCatalogo,
  useEtiquetasSugeridas,
  useGuardarTaller,
  useTaller,
  useTallerPublicado,
  useTalleres,
} from './useTalleres'

/*
 * Contrato de consultas.ts (decisión 0012): lanzan ante cualquier error.
 *   obtenerTalleres(): Promise<Taller[]>
 *   guardarTaller(datos): Promise<number>   // datos = args de la RPC guardar_taller
 *   cambiarEstadoTaller(id: number, estado: EstadoTaller): Promise<unknown>
 * Todos los hooks comparten la clave ['talleres'] y filtran con `select`.
 * useGuardarTaller().mutate(datos); useCambiarEstadoTaller().mutate({ id, estado }).
 * useEtiquetasSugeridas() devuelve directamente un string[] (nombres únicos de la caché, ordenados).
 */
vi.mock('../consultas', () => ({
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

function taller(id: number, p: Partial<Taller> & { nivel_id?: number } = {}): Taller {
  const { nivel_id = 3, ...resto } = p
  return {
    id,
    categoria_id: 7,
    nombre: `Taller ${id}`,
    descripcion: '',
    estado: 'PUBLICADO',
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    categoria: { nivel_id },
    destinatario: [],
    etiqueta: [],
    ...resto,
  }
}

const docentes = { id: 4, nombre: 'Docentes' }

const todos = [
  taller(1, { categoria_id: 7, nombre: 'Huerta', estado: 'PUBLICADO', nivel_id: 2, destinatario: [docentes], etiqueta: [{ id: 1, nombre: 'salud' }, { id: 2, nombre: 'ambiente' }] }),
  taller(2, { categoria_id: 8, nombre: 'Cuidados en redes', estado: 'BORRADOR', nivel_id: 3, etiqueta: [{ id: 3, nombre: 'redes' }, { id: 1, nombre: 'salud' }] }),
  taller(3, { categoria_id: 7, nombre: 'Ajedrez', estado: 'INACTIVO', nivel_id: 2 }),
  taller(4, { categoria_id: 8, nombre: 'Robótica', estado: 'PUBLICADO', nivel_id: 3 }),
]

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerTalleres).mockResolvedValue(todos)
})

describe('useTalleres', () => {
  it('sin categoría devuelve todos los que resuelve obtenerTalleres, también borradores e inactivos', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useTalleres(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(todos)
  })

  it('con categoriaId filtra por categoria_id', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useTalleres(8), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((t) => t.id)).toEqual([2, 4])
  })

  it('varios hooks con la clave única ["talleres"] comparten una sola consulta', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => [useTalleres(7), useTalleres(8)], { wrapper })
    await waitFor(() => expect(result.current.every((q) => q.isSuccess)).toBe(true))
    expect(obtenerTalleres).toHaveBeenCalledTimes(1)
  })

  it('si obtenerTalleres falla, expone el error', async () => {
    vi.mocked(obtenerTalleres).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useTalleres(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useTaller', () => {
  it('devuelve el taller con ese id, de cualquier estado', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useTaller(2), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.nombre).toBe('Cuidados en redes')
  })

  it('devuelve null si el taller no está', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useTaller(999), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})

describe('useEtiquetasSugeridas', () => {
  it('devuelve los nombres únicos de las etiquetas de los talleres, ordenados', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEtiquetasSugeridas(), { wrapper })
    await waitFor(() => expect(result.current).toEqual(['ambiente', 'redes', 'salud']))
  })

  it('mientras no hay datos devuelve una lista vacía', () => {
    vi.mocked(obtenerTalleres).mockReturnValue(new Promise(() => {}))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEtiquetasSugeridas(), { wrapper })
    expect(result.current).toEqual([])
  })
})

describe('useCatalogo', () => {
  it('devuelve solo los talleres publicados, aunque obtenerTalleres traiga borradores e inactivos', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useCatalogo({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((t) => t.id)).toEqual([1, 4])
  })

  it('aplica los filtros de nivel, destinatario y búsqueda sobre los publicados', async () => {
    const { wrapper } = crearContexto()
    const { result: porNivel } = renderHook(() => useCatalogo({ nivelId: 3 }), { wrapper })
    await waitFor(() => expect(porNivel.current.isSuccess).toBe(true))
    expect(porNivel.current.data?.map((t) => t.id)).toEqual([4]) // el 2 es borrador

    const { result: porDest } = renderHook(() => useCatalogo({ destinatarioId: 4 }), { wrapper })
    await waitFor(() => expect(porDest.current.isSuccess).toBe(true))
    expect(porDest.current.data?.map((t) => t.id)).toEqual([1])

    const { result: porTexto } = renderHook(() => useCatalogo({ busqueda: 'ROBOTICA' }), { wrapper })
    await waitFor(() => expect(porTexto.current.isSuccess).toBe(true))
    expect(porTexto.current.data?.map((t) => t.id)).toEqual([4])
  })
})

describe('useTallerPublicado', () => {
  it('devuelve el taller si está publicado', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useTallerPublicado(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.id).toBe(1)
  })

  it('devuelve null si es borrador o inactivo', async () => {
    const { wrapper } = crearContexto()
    const { result: borrador } = renderHook(() => useTallerPublicado(2), { wrapper })
    const { result: inactivo } = renderHook(() => useTallerPublicado(3), { wrapper })
    await waitFor(() => expect(borrador.current.isSuccess && inactivo.current.isSuccess).toBe(true))
    expect(borrador.current.data).toBeNull()
    expect(inactivo.current.data).toBeNull()
  })

  it('devuelve null si no existe', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useTallerPublicado(999), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})

describe('useGuardarTaller', () => {
  const datos = {
    p_categoria_id: 7,
    p_nombre: 'Nuevo',
    p_descripcion: 'Desc',
    p_estado: 'BORRADOR' as const,
    p_destinatarios: [1],
    p_etiquetas: ['redes'],
  }

  it('llama a guardarTaller con los datos y refresca la lista de talleres', async () => {
    vi.mocked(guardarTaller).mockResolvedValue(10)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => ({ lista: useTalleres(), guardar: useGuardarTaller() }), { wrapper })
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true))
    expect(obtenerTalleres).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.guardar.mutateAsync(datos)
    })

    expect(vi.mocked(guardarTaller).mock.calls[0][0]).toEqual(datos)
    await waitFor(() => expect(obtenerTalleres).toHaveBeenCalledTimes(2))
  })

  it('si guardarTaller falla, expone el error y no refresca', async () => {
    vi.mocked(guardarTaller).mockRejectedValue({ code: 'DA002' })
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => ({ lista: useTalleres(), guardar: useGuardarTaller() }), { wrapper })
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true))

    await act(async () => {
      result.current.guardar.mutate(datos)
    })
    await waitFor(() => expect(result.current.guardar.isError).toBe(true))
    expect(result.current.guardar.error).toEqual({ code: 'DA002' })
    expect(obtenerTalleres).toHaveBeenCalledTimes(1)
  })
})

describe('useCambiarEstadoTaller', () => {
  it('llama a cambiarEstadoTaller(id, estado) y refresca la lista de talleres', async () => {
    vi.mocked(cambiarEstadoTaller).mockResolvedValue(undefined)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => ({ lista: useTalleres(), cambiar: useCambiarEstadoTaller() }), { wrapper })
    await waitFor(() => expect(result.current.lista.isSuccess).toBe(true))

    await act(async () => {
      await result.current.cambiar.mutateAsync({ id: 1, estado: 'INACTIVO' })
    })

    expect(cambiarEstadoTaller).toHaveBeenCalledWith(1, 'INACTIVO')
    await waitFor(() => expect(obtenerTalleres).toHaveBeenCalledTimes(2))
  })
})
