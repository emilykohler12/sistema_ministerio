import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { registrarDescarga } from '../consultas'
import type { DatosDescarga } from '../types'
import { marcarTallerRegistrado, tallerRegistrado } from '../visita'
import { useRegistrarDescarga } from './useRegistrarDescarga'

/*
 * Contrato (corte descargas, criterios 4 y 5). src/features/descargas/hooks/useRegistrarDescarga.ts:
 *   useRegistrarDescarga() -> una mutación de React Query
 *     mutateAsync({ tallerId: number; datos: DatosDescarga }): Promise<void>
 *     - Si tallerRegistrado(tallerId) es falso: registrarDescarga(tallerId, datos) y, solo si responde bien, marcarTallerRegistrado(tallerId).
 *       Si ya estaba marcado, no registra.
 *     - DA004 (institución no disponible): invalida ['establecimientos', datos.localidad_id] y no marca.
 *     - DA003 (taller no disponible): no invalida nada acá (lo hace el modal al cerrarse) y no marca.
 *     - Cualquier error de registro: no marca el taller.
 * El módulo ../visita es el real (la marca vive en memoria): cada test usa un id de taller distinto.
 */
vi.mock('../consultas', () => ({
  registrarDescarga: vi.fn(),
}))

let siguienteId = 1000
const unId = () => siguienteId++

const datos: DatosDescarga = {
  cargo: 'Docente',
  cargo_otro: null,
  localidad_id: 7,
  institucion_tipo: 'PADRON',
  establecimiento_id: 30,
  institucion_otra: null,
}

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(registrarDescarga).mockResolvedValue(undefined)
})

describe('useRegistrarDescarga', () => {
  it('registra la descarga y marca el taller', async () => {
    const tallerId = unId()
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useRegistrarDescarga(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ tallerId, datos })
    })

    expect(registrarDescarga).toHaveBeenCalledWith(tallerId, datos)
    expect(tallerRegistrado(tallerId)).toBe(true)
  })

  it('un taller ya registrado en la visita no vuelve a registrarse', async () => {
    const tallerId = unId()
    marcarTallerRegistrado(tallerId)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useRegistrarDescarga(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ tallerId, datos })
    })

    expect(registrarDescarga).not.toHaveBeenCalled()
  })

  it('si el registro falla con un error cualquiera, no marca el taller', async () => {
    const tallerId = unId()
    vi.mocked(registrarDescarga).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useRegistrarDescarga(), { wrapper })

    await act(async () => {
      result.current.mutate({ tallerId, datos })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(tallerRegistrado(tallerId)).toBe(false)
  })

  it('DA003 no marca el taller ni invalida nada: el modal invalida los talleres al cerrarse', async () => {
    const tallerId = unId()
    vi.mocked(registrarDescarga).mockRejectedValue({ code: 'DA003', message: 'no disponible' })
    const { client, wrapper } = crearContexto()
    client.setQueryData(['talleres'], [])
    const { result } = renderHook(() => useRegistrarDescarga(), { wrapper })

    await act(async () => {
      result.current.mutate({ tallerId, datos })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toMatchObject({ code: 'DA003' })
    expect(client.getQueryState(['talleres'])?.isInvalidated).toBe(false)
    expect(tallerRegistrado(tallerId)).toBe(false)
  })

  it('DA004 invalida la lista de establecimientos de esa localidad y no las demás, y no marca', async () => {
    const tallerId = unId()
    vi.mocked(registrarDescarga).mockRejectedValue({ code: 'DA004', message: 'no disponible' })
    const { client, wrapper } = crearContexto()
    client.setQueryData(['establecimientos', 7], [])
    client.setQueryData(['establecimientos', 8], [])
    client.setQueryData(['talleres'], [])
    const { result } = renderHook(() => useRegistrarDescarga(), { wrapper })

    await act(async () => {
      result.current.mutate({ tallerId, datos })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(client.getQueryState(['establecimientos', 7])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['establecimientos', 8])?.isInvalidated).toBe(false)
    expect(client.getQueryState(['talleres'])?.isInvalidated).toBe(false)
    expect(tallerRegistrado(tallerId)).toBe(false)
  })
})
