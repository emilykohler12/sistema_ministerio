import { QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { obtenerHistorial } from '../consultas'
import { FILTROS_VACIOS, type FiltrosHistorial } from '../filtros'
import type { Operacion } from '../types'
import { useHistorial } from './useHistorial'

/*
 * Contrato (spec Diseño):
 *   useHistorial(filtros: FiltrosHistorial): UseQueryResult<{ filas: Operacion[]; total: number | null }>
 *   - queryKey ['historial', filtros]
 *   - queryFn: obtenerHistorial(filtros)
 *   - enabled solo si validarFiltros(filtros) === null
 *   - placeholderData: keepPreviousData (isPlaceholderData al cambiar de filtros o de página)
 */
vi.mock('../consultas', () => ({ obtenerHistorial: vi.fn() }))

const op = (id: number): Operacion => ({
  id,
  usuario_id: null,
  operacion: 'INSERT',
  tabla: 'taller',
  registro_id: String(id),
  datos_anteriores: null,
  datos_nuevos: { id, nombre: `T${id}` },
  fecha_hora: '2026-10-16T12:00:00Z',
})
const pagina = (id: number, total = 1) => ({ filas: [op(id)], total })
const f = (p: Partial<FiltrosHistorial> = {}): FiltrosHistorial => ({ ...FILTROS_VACIOS, ...p })

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useHistorial', () => {
  it('consulta con los filtros y devuelve los datos', async () => {
    vi.mocked(obtenerHistorial).mockResolvedValue(pagina(1))
    const { wrapper } = crearContexto()
    const filtros = f({ entidad: 'taller', pagina: 2 })
    const { result } = renderHook(() => useHistorial(filtros), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(pagina(1))
    expect(obtenerHistorial).toHaveBeenCalledWith(filtros)
  })

  it('usa la clave ["historial", filtros]', async () => {
    vi.mocked(obtenerHistorial).mockResolvedValue(pagina(1))
    const { client, wrapper } = crearContexto()
    const filtros = f({ usuario: 'sistema' })
    const { result } = renderHook(() => useHistorial(filtros), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryData(['historial', filtros])).toEqual(pagina(1))
  })

  it('con desde > hasta no consulta', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useHistorial(f({ desde: '2026-03-12', hasta: '2026-03-10' })), { wrapper })
    await new Promise((r) => setTimeout(r, 30))
    expect(obtenerHistorial).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('con una fecha mal formada tampoco consulta', async () => {
    const { wrapper } = crearContexto()
    renderHook(() => useHistorial(f({ desde: 'hola' })), { wrapper })
    await new Promise((r) => setTimeout(r, 30))
    expect(obtenerHistorial).not.toHaveBeenCalled()
  })

  it('al cambiar de página mantiene los datos anteriores hasta que llegan los nuevos', async () => {
    let resolverSegundo: (v: ReturnType<typeof pagina>) => void = () => {}
    vi.mocked(obtenerHistorial)
      .mockResolvedValueOnce(pagina(1))
      .mockReturnValueOnce(new Promise((r) => (resolverSegundo = r)))
    const { wrapper } = crearContexto()
    const { result, rerender } = renderHook(({ filtros }) => useHistorial(filtros), {
      wrapper,
      initialProps: { filtros: f() },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    rerender({ filtros: f({ pagina: 2 }) })
    await waitFor(() => expect(obtenerHistorial).toHaveBeenCalledTimes(2))
    expect(result.current.data?.filas[0].id).toBe(1)
    expect(result.current.isPlaceholderData).toBe(true)

    resolverSegundo(pagina(2))
    await waitFor(() => expect(result.current.data?.filas[0].id).toBe(2))
    expect(result.current.isPlaceholderData).toBe(false)
  })

  it('si obtenerHistorial rechaza, el hook queda en error', async () => {
    vi.mocked(obtenerHistorial).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useHistorial(f()), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
