import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { obtenerSinVincular, vincularInstitucion } from '../consultas'
import type { GrupoSinVincular } from '../types'
import { useSinVincular, useVincular } from './useSinVincular'

/*
 * Contrato (hooks delgados de src/features/establecimientos/hooks/useSinVincular.ts). Se mockea `../consultas`:
 *   obtenerSinVincular(): Promise<GrupoSinVincular[]>
 *   vincularInstitucion(localidadId: number, nombre: string, establecimientoId: number): Promise<number>
 *   useSinVincular()   clave ['establecimientos', 'sin-vincular']
 *   useVincular().mutateAsync({ localidadId, nombre, establecimientoId }) -> número de registros vinculados (0 incluido)
 *     invalida ['establecimientos'] (cubre 'sin-vincular' y la lista de la localidad) y ['dashboard'] en onSettled:
 *     al salir bien, con 0 y también al fallar (el mensaje "ya estaba vinculado" / DA005 promete refrescar).
 */
vi.mock('../consultas', () => ({
  obtenerSinVincular: vi.fn(),
  vincularInstitucion: vi.fn(),
}))

const grupo: GrupoSinVincular = {
  localidad_id: 2,
  localidad: 'Posadas',
  nombre: 'Escuela 123',
  variantes: [],
  descargas: 2,
  ultima: '2026-10-16T12:00:00Z',
}

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

const variables = { localidadId: 2, nombre: 'Escuela 123', establecimientoId: 40 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(obtenerSinVincular).mockResolvedValue([grupo])
})

describe('useSinVincular', () => {
  it('devuelve los grupos con la clave ["establecimientos", "sin-vincular"]', async () => {
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useSinVincular(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([grupo])
    expect(client.getQueryData(['establecimientos', 'sin-vincular'])).toEqual([grupo])
  })

  it('si la consulta falla, expone el error', async () => {
    vi.mocked(obtenerSinVincular).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useSinVincular(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useVincular', () => {
  function sembrar(client: ReturnType<typeof crearContexto>['client']) {
    client.setQueryData(['establecimientos', 'sin-vincular'], [grupo])
    client.setQueryData(['establecimientos', 2], [])
    client.setQueryData(['dashboard', '2026-10-01', '2026-10-16'], {})
  }
  const invalidada = (client: ReturnType<typeof crearContexto>['client'], clave: unknown[]) =>
    client.getQueryState(clave)?.isInvalidated

  it('llama a vincularInstitucion(localidadId, nombre, establecimientoId) y devuelve la cantidad', async () => {
    vi.mocked(vincularInstitucion).mockResolvedValue(3)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useVincular(), { wrapper })

    let cantidad: number | undefined
    await act(async () => {
      cantidad = await result.current.mutateAsync(variables)
    })

    expect(vincularInstitucion).toHaveBeenCalledWith(2, 'Escuela 123', 40)
    expect(cantidad).toBe(3)
  })

  it('al salir bien invalida la lista, los establecimientos y el dashboard', async () => {
    vi.mocked(vincularInstitucion).mockResolvedValue(3)
    const { client, wrapper } = crearContexto()
    sembrar(client)
    const { result } = renderHook(() => useVincular(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(variables)
    })

    expect(invalidada(client, ['establecimientos', 'sin-vincular'])).toBe(true)
    expect(invalidada(client, ['establecimientos', 2])).toBe(true)
    expect(invalidada(client, ['dashboard', '2026-10-01', '2026-10-16'])).toBe(true)
  })

  it('con 0 (ya estaba vinculado) también invalida', async () => {
    vi.mocked(vincularInstitucion).mockResolvedValue(0)
    const { client, wrapper } = crearContexto()
    sembrar(client)
    const { result } = renderHook(() => useVincular(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(variables)
    })

    expect(invalidada(client, ['establecimientos', 'sin-vincular'])).toBe(true)
    expect(invalidada(client, ['dashboard', '2026-10-01', '2026-10-16'])).toBe(true)
  })

  it('si falla (DA005), expone el error e invalida igual (onSettled)', async () => {
    vi.mocked(vincularInstitucion).mockRejectedValue({ code: 'DA005' })
    const { client, wrapper } = crearContexto()
    sembrar(client)
    const { result } = renderHook(() => useVincular(), { wrapper })

    await act(async () => {
      result.current.mutate(variables)
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toEqual({ code: 'DA005' })
    await waitFor(() => expect(invalidada(client, ['establecimientos', 'sin-vincular'])).toBe(true))
    expect(invalidada(client, ['establecimientos', 2])).toBe(true)
    expect(invalidada(client, ['dashboard', '2026-10-01', '2026-10-16'])).toBe(true)
  })
})
