import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { obtenerEtiquetas } from '../consultas'
import { CLAVE_ETIQUETAS, useEtiquetas } from './useEtiquetas'

/*
 * Criterio 9: las etiquetas sugeridas salen de la tabla `etiqueta` y se comparten entre taller y normativa.
 * Reemplaza a `useEtiquetasSugeridas` (que se borra de talleres/hooks/useTalleres.ts).
 * Contrato (decisión 0012):
 *   src/features/etiquetas/consultas.ts (solo supabase, lanza ante cualquier error)
 *     obtenerEtiquetas(): Promise<{ id: number; nombre: string }[]>      // select de la tabla `etiqueta`
 *   src/features/etiquetas/hooks/useEtiquetas.ts
 *     CLAVE_ETIQUETAS = ['etiquetas'] as const       // la invalidan las mutaciones de taller y de normativa
 *     useEtiquetas(): string[]    // nombres únicos, ordenados (es), [] mientras carga o si falla
 */
vi.mock('../consultas', () => ({ obtenerEtiquetas: vi.fn() }))

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CLAVE_ETIQUETAS', () => {
  it('es la clave única de las etiquetas: ["etiquetas"]', () => {
    expect(CLAVE_ETIQUETAS).toEqual(['etiquetas'])
  })
})

describe('useEtiquetas', () => {
  it('devuelve los nombres de las etiquetas que entrega obtenerEtiquetas, ordenados', async () => {
    vi.mocked(obtenerEtiquetas).mockResolvedValue([
      { id: 3, nombre: 'salud' },
      { id: 1, nombre: 'ambiente' },
      { id: 2, nombre: 'Ñandú' },
      { id: 4, nombre: 'redes' },
    ])
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEtiquetas(), { wrapper })
    await waitFor(() => expect(result.current).toEqual(['ambiente', 'Ñandú', 'redes', 'salud']))
  })

  it('guarda la consulta bajo la clave ["etiquetas"]', async () => {
    vi.mocked(obtenerEtiquetas).mockResolvedValue([{ id: 1, nombre: 'salud' }])
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useEtiquetas(), { wrapper })
    await waitFor(() => expect(result.current).toEqual(['salud']))
    expect(client.getQueryState(['etiquetas'])?.status).toBe('success')
  })

  it('mientras carga devuelve una lista vacía', () => {
    vi.mocked(obtenerEtiquetas).mockReturnValue(new Promise(() => {}))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEtiquetas(), { wrapper })
    expect(result.current).toEqual([])
  })

  it('si obtenerEtiquetas falla devuelve una lista vacía', async () => {
    vi.mocked(obtenerEtiquetas).mockRejectedValue(new Error('sin red'))
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useEtiquetas(), { wrapper })
    await waitFor(() => expect(client.getQueryState(['etiquetas'])?.status).toBe('error'))
    expect(result.current).toEqual([])
  })

  it('varios componentes comparten una sola consulta', async () => {
    vi.mocked(obtenerEtiquetas).mockResolvedValue([{ id: 1, nombre: 'salud' }])
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => [useEtiquetas(), useEtiquetas()], { wrapper })
    await waitFor(() => expect(result.current[0]).toEqual(['salud']))
    expect(obtenerEtiquetas).toHaveBeenCalledTimes(1)
  })
})
