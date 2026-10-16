import { QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { obtenerMetricas } from '../consultas'
import type { Periodo } from '../periodo'
import type { Metricas } from '../types'
import { useMetricas } from './useMetricas'

/*
 * Contrato (spec criterios 1 y 8, crítica 11):
 *   useMetricas(periodo: Periodo): UseQueryResult<Metricas>
 *   - queryKey ['dashboard', periodo.desde, periodo.hasta]
 *   - queryFn: obtenerMetricas({ desde, hasta, porMes })
 *   - enabled solo si validarPeriodo(periodo) === null (con período inválido no consulta)
 *   - placeholderData: keepPreviousData
 */
vi.mock('../consultas', () => ({ obtenerMetricas: vi.fn() }))

function metricas(descargas: number): Metricas {
  return {
    resumen: { descargas, establecimientos_alcanzados: 0, talleres_publicados: 0, sin_vincular: 0 },
    serie: [],
    talleres: [],
    niveles: [],
    cargos: [],
    localidades: [],
    normativas: [],
  }
}

const p = (desde: string, hasta: string): Periodo => ({ tipo: 'rango', desde, hasta, porMes: false })

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMetricas', () => {
  it('consulta con desde, hasta y porMes y devuelve los datos', async () => {
    vi.mocked(obtenerMetricas).mockResolvedValue(metricas(5))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useMetricas(p('2026-03-10', '2026-03-12')), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.resumen.descargas).toBe(5)
    expect(obtenerMetricas).toHaveBeenCalledWith({ desde: '2026-03-10', hasta: '2026-03-12', porMes: false })
  })

  it('usa la clave ["dashboard", desde, hasta]', async () => {
    vi.mocked(obtenerMetricas).mockResolvedValue(metricas(5))
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useMetricas(p('2026-03-10', '2026-03-12')), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryData(['dashboard', '2026-03-10', '2026-03-12'])).toEqual(metricas(5))
  })

  it('con un período inválido (desde > hasta) no consulta', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useMetricas(p('2026-03-12', '2026-03-10')), { wrapper })
    await new Promise((r) => setTimeout(r, 30))
    expect(obtenerMetricas).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('con un hasta posterior a hoy tampoco consulta', async () => {
    const { wrapper } = crearContexto()
    renderHook(() => useMetricas(p('2026-03-10', '9999-12-31')), { wrapper })
    await new Promise((r) => setTimeout(r, 30))
    expect(obtenerMetricas).not.toHaveBeenCalled()
  })

  it('al cambiar a otro período válido mantiene los datos anteriores hasta que llegan los nuevos', async () => {
    let resolverSegundo: (m: Metricas) => void = () => {}
    vi.mocked(obtenerMetricas)
      .mockResolvedValueOnce(metricas(5))
      .mockReturnValueOnce(new Promise<Metricas>((r) => (resolverSegundo = r)))
    const { wrapper } = crearContexto()
    const { result, rerender } = renderHook(({ per }) => useMetricas(per), {
      wrapper,
      initialProps: { per: p('2026-03-10', '2026-03-12') },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    rerender({ per: p('2026-03-01', '2026-03-12') })
    await waitFor(() => expect(obtenerMetricas).toHaveBeenCalledTimes(2))
    expect(result.current.data?.resumen.descargas).toBe(5)
    expect(result.current.isPlaceholderData).toBe(true)

    resolverSegundo(metricas(9))
    await waitFor(() => expect(result.current.data?.resumen.descargas).toBe(9))
    expect(result.current.isPlaceholderData).toBe(false)
  })

  it('si obtenerMetricas rechaza, el hook queda en error', async () => {
    vi.mocked(obtenerMetricas).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useMetricas(p('2026-03-10', '2026-03-12')), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
