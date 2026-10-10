import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import {
  actualizarEstablecimiento,
  crearEstablecimiento,
  obtenerEstablecimiento,
  obtenerEstablecimientos,
  obtenerLocalidades,
} from '../consultas'
import type { Establecimiento, Localidad } from '../types'
import {
  useActualizarEstablecimiento,
  useCrearEstablecimiento,
  useEstablecimiento,
  useEstablecimientos,
  useLocalidades,
} from './useEstablecimientos'

/*
 * Contrato (hooks delgados de src/features/establecimientos/hooks/useEstablecimientos.ts). Se mockea `../consultas`:
 *   obtenerLocalidades(): Promise<Localidad[]>                       // las 79, ordenadas por nombre
 *   obtenerEstablecimientos(localidadId: number): Promise<Establecimiento[]>   // todos los de la localidad (activos e inactivos), orden nombre, id
 *   obtenerEstablecimiento(id: number): Promise<Establecimiento | null>        // null si no existe
 *   crearEstablecimiento(datos: DatosEstablecimiento): Promise<Establecimiento>
 *   actualizarEstablecimiento(id: number, cambios: Partial<DatosEstablecimiento & { activo: boolean }>): Promise<Establecimiento>
 *   con DatosEstablecimiento = { cue: string | null; nombre: string; localidad_id: number }  (types.ts)
 * Hooks y claves:
 *   useLocalidades()                      clave ['localidades'], staleTime: Infinity
 *   useEstablecimientos(localidadId: number | null)   clave ['establecimientos', localidadId]; sin consulta si es null
 *   useEstablecimiento(id: number | null)  clave ['establecimientos', 'detalle', id]; sin consulta si es null; data null si no existe
 *   useCrearEstablecimiento().mutateAsync(datos)
 *   useActualizarEstablecimiento().mutateAsync({ id, cambios })
 *     ambas mutaciones invalidan ['establecimientos'] (lista y detalle) al salir bien, y ninguna al fallar.
 */
vi.mock('../consultas', () => ({
  obtenerLocalidades: vi.fn(),
  obtenerEstablecimientos: vi.fn(),
  obtenerEstablecimiento: vi.fn(),
  crearEstablecimiento: vi.fn(),
  actualizarEstablecimiento: vi.fn(),
}))

function establecimiento(id: number, p: Partial<Establecimiento> = {}): Establecimiento {
  return {
    id,
    cue: null,
    nombre: `Escuela ${id}`,
    localidad_id: 1,
    activo: true,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}

const localidades: Localidad[] = [
  { id: 1, nombre: '25 de Mayo' },
  { id: 2, nombre: '9 de Julio' },
]

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(obtenerLocalidades).mockResolvedValue(localidades)
  vi.mocked(obtenerEstablecimientos).mockImplementation(async (localidadId) => [
    establecimiento(localidadId * 10, { localidad_id: localidadId }),
  ])
  vi.mocked(obtenerEstablecimiento).mockImplementation(async (id) => (id === 5 ? establecimiento(5) : null))
})

describe('useLocalidades', () => {
  it('devuelve las localidades y las consulta una sola vez entre varios hooks', async () => {
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => [useLocalidades(), useLocalidades()], { wrapper })
    await waitFor(() => expect(result.current.every((q) => q.isSuccess)).toBe(true))
    expect(result.current[0].data).toEqual(localidades)
    expect(obtenerLocalidades).toHaveBeenCalledTimes(1)
    expect(client.getQueryCache().find({ queryKey: ['localidades'] })).toBeDefined()
  })

  it('nunca se queda desactualizada (staleTime Infinity): las localidades cambian por migración', async () => {
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useLocalidades(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryCache().find({ queryKey: ['localidades'] })?.isStale()).toBe(false)
  })

  it('si la consulta falla, expone el error', async () => {
    vi.mocked(obtenerLocalidades).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useLocalidades(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useEstablecimientos', () => {
  it('con una localidad consulta sus establecimientos con la clave ["establecimientos", id]', async () => {
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useEstablecimientos(2), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(obtenerEstablecimientos).toHaveBeenCalledWith(2)
    expect(result.current.data?.map((e) => e.id)).toEqual([20])
    expect(client.getQueryData(['establecimientos', 2])).toBeDefined()
  })

  it('sin localidad (null) no consulta nada', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEstablecimientos(null), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(obtenerEstablecimientos).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(true)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('al cambiar de localidad consulta la nueva', async () => {
    const { wrapper } = crearContexto()
    const { result, rerender } = renderHook(({ id }) => useEstablecimientos(id), {
      wrapper,
      initialProps: { id: 1 as number | null },
    })
    await waitFor(() => expect(result.current.data?.[0].localidad_id).toBe(1))
    rerender({ id: 2 })
    await waitFor(() => expect(result.current.data?.[0].localidad_id).toBe(2))
    expect(obtenerEstablecimientos).toHaveBeenCalledTimes(2)
  })

  it('si la consulta falla, expone el error', async () => {
    vi.mocked(obtenerEstablecimientos).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEstablecimientos(1), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useEstablecimiento', () => {
  it('devuelve el establecimiento con la clave ["establecimientos", "detalle", id]', async () => {
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useEstablecimiento(5), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.id).toBe(5)
    expect(obtenerEstablecimiento).toHaveBeenCalledWith(5)
    expect(client.getQueryData(['establecimientos', 'detalle', 5])).toBeDefined()
  })

  it('devuelve null si no existe', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEstablecimiento(999), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('con id null no consulta', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEstablecimiento(null), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(obtenerEstablecimiento).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useCrearEstablecimiento', () => {
  const datos = { cue: '5400123', nombre: 'Escuela Nueva', localidad_id: 1 }

  it('llama a crearEstablecimiento e invalida lista y detalle de ["establecimientos"]', async () => {
    vi.mocked(crearEstablecimiento).mockResolvedValue(establecimiento(31))
    const { client, wrapper } = crearContexto()
    client.setQueryData(['establecimientos', 1], [])
    client.setQueryData(['establecimientos', 'detalle', 5], establecimiento(5))
    const { result } = renderHook(() => useCrearEstablecimiento(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(datos)
    })

    expect(crearEstablecimiento).toHaveBeenCalledWith(datos)
    expect(client.getQueryState(['establecimientos', 1])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['establecimientos', 'detalle', 5])?.isInvalidated).toBe(true)
  })

  it('si falla, expone el error y no invalida nada', async () => {
    vi.mocked(crearEstablecimiento).mockRejectedValue({ code: '23505' })
    const { client, wrapper } = crearContexto()
    client.setQueryData(['establecimientos', 1], [])
    const { result } = renderHook(() => useCrearEstablecimiento(), { wrapper })

    await act(async () => {
      result.current.mutate(datos)
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toEqual({ code: '23505' })
    expect(client.getQueryState(['establecimientos', 1])?.isInvalidated).toBe(false)
  })
})

describe('useActualizarEstablecimiento', () => {
  it('llama a actualizarEstablecimiento(id, cambios) e invalida ["establecimientos"]', async () => {
    vi.mocked(actualizarEstablecimiento).mockResolvedValue(establecimiento(5, { activo: false }))
    const { client, wrapper } = crearContexto()
    client.setQueryData(['establecimientos', 1], [])
    client.setQueryData(['establecimientos', 'detalle', 5], establecimiento(5))
    const { result } = renderHook(() => useActualizarEstablecimiento(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 5, cambios: { activo: false } })
    })

    expect(actualizarEstablecimiento).toHaveBeenCalledWith(5, { activo: false })
    expect(client.getQueryState(['establecimientos', 1])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['establecimientos', 'detalle', 5])?.isInvalidated).toBe(true)
  })

  it('si falla, expone el error y no invalida nada', async () => {
    vi.mocked(actualizarEstablecimiento).mockRejectedValue(new Error('sin red'))
    const { client, wrapper } = crearContexto()
    client.setQueryData(['establecimientos', 1], [])
    const { result } = renderHook(() => useActualizarEstablecimiento(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 5, cambios: { nombre: 'X' } })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(client.getQueryState(['establecimientos', 1])?.isInvalidated).toBe(false)
  })
})
