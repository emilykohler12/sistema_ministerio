import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recurso } from '@/features/recursos/types'
import { crearQueryClient } from '@/test/utils'
import { firmarEnlaces, registrarDescarga } from '../consultas'
import type { EnlaceDescarga } from '../types'
import { useEnlacesDescarga } from './useEnlacesDescarga'

/*
 * Contrato (corte descargas, criterios 3 y 5). src/features/descargas/hooks/useEnlacesDescarga.ts:
 *   useEnlacesDescarga(taller: { id; recurso }, habilitado: boolean) -> una query de React Query
 *     - habilitado=false: no firma. habilitado=true: firmarEnlaces(taller.recurso).
 *     - gcTime 0 (firma de nuevo en cada apertura), un reintento y sin refetch al recuperar el foco.
 *     - refetch() solo vuelve a firmar: nunca registra (el hook no conoce registrarDescarga).
 */
vi.mock('../consultas', () => ({
  registrarDescarga: vi.fn(),
  firmarEnlaces: vi.fn(),
}))

const taller = {
  id: 77,
  recurso: [
    {
      id: 1,
      taller_id: 77,
      nombre: 'Guía',
      tipo: 'PDF',
      ruta_archivo: '77/a.pdf',
      url: null,
      tamanio_bytes: 100,
      orden: 1,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    },
  ] as Recurso[],
}
const enlaces: EnlaceDescarga[] = [{ recurso: taller.recurso[0], url: 'https://firmada.test/a' }]

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useEnlacesDescarga', () => {
  it('deshabilitado no firma', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEnlacesDescarga(taller, false), { wrapper })
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.fetchStatus).toBe('idle')
    expect(firmarEnlaces).not.toHaveBeenCalled()
  })

  it('habilitado firma los recursos del taller y devuelve los enlaces', async () => {
    vi.mocked(firmarEnlaces).mockResolvedValue(enlaces)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEnlacesDescarga(taller, true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(firmarEnlaces).toHaveBeenCalledWith(taller.recurso)
    expect(result.current.data).toEqual(enlaces)
  })

  it('no guarda los enlaces cuando nadie los observa (gcTime 0)', async () => {
    vi.mocked(firmarEnlaces).mockResolvedValue(enlaces)
    const { client, wrapper } = crearContexto()
    const { result, unmount } = renderHook(() => useEnlacesDescarga(taller, true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    unmount()
    await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ['descargas', 'enlaces'] })).toHaveLength(0))
  })

  it('reintenta una vez una firma rechazada y reintentar (refetch) solo vuelve a firmar', async () => {
    vi.mocked(firmarEnlaces).mockRejectedValueOnce(new Error('firma')).mockRejectedValueOnce(new Error('firma'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useEnlacesDescarga(taller, true), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 })
    expect(firmarEnlaces).toHaveBeenCalledTimes(2)

    vi.mocked(firmarEnlaces).mockResolvedValue(enlaces)
    await result.current.refetch()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(firmarEnlaces).toHaveBeenCalledTimes(3)
    expect(registrarDescarga).not.toHaveBeenCalled()
  })
})
