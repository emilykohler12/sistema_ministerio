import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recurso } from '@/features/recursos/types'
import { crearQueryClient } from '@/test/utils'
import { firmarEnlaces, registrarDescarga } from '../consultas'
import type { DatosDescarga, EnlaceDescarga } from '../types'
import { tallerRegistrado } from '../visita'
import { useDescargarTaller } from './useDescargarTaller'

/*
 * Contrato (corte descargas, criterios 3, 4 y 5). src/features/descargas/hooks/useDescargarTaller.ts:
 *   useDescargarTaller() -> una mutación de React Query
 *     mutateAsync({ taller: { id: number; recurso: Recurso[] }, datos?: DatosDescarga }): Promise<EnlaceDescarga[]>
 *   Pasos:
 *     1. Si tallerRegistrado(taller.id) es falso: registrarDescarga(taller.id, datos) y, solo si responde bien,
 *        marcarTallerRegistrado(taller.id). Si ya estaba marcado, no registra.
 *     2. firmarEnlaces(taller.recurso) y devuelve su resultado.
 *   Errores:
 *     - DA003 (taller no disponible): invalida ['talleres'] y no firma.
 *     - DA004 (institución no disponible): invalida ['establecimientos', datos.localidad_id] y no firma ni marca.
 *     - Cualquier error de registro: no marca el taller.
 *     - Si falla la firma después de registrar, el taller queda marcado: volver a llamar solo firma.
 * El módulo ../visita es el real (la marca vive en memoria): cada test usa un id de taller distinto.
 */
vi.mock('../consultas', () => ({
  registrarDescarga: vi.fn(),
  firmarEnlaces: vi.fn(),
}))

let siguienteId = 1000
function unTaller() {
  const id = siguienteId++
  const recurso: Recurso[] = [
    {
      id: id * 10,
      taller_id: id,
      nombre: 'Guía',
      tipo: 'PDF',
      ruta_archivo: `${id}/a.pdf`,
      url: null,
      tamanio_bytes: 100,
      orden: 1,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    },
  ]
  return { id, recurso }
}

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

describe('useDescargarTaller', () => {
  it('registra la descarga, marca el taller y devuelve los enlaces firmados', async () => {
    const taller = unTaller()
    const enlaces: EnlaceDescarga[] = [{ recurso: taller.recurso[0], url: 'https://firmada.test/a' }]
    vi.mocked(firmarEnlaces).mockResolvedValue(enlaces)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useDescargarTaller(), { wrapper })

    let devuelto: EnlaceDescarga[] | undefined
    await act(async () => {
      devuelto = await result.current.mutateAsync({ taller, datos })
    })

    expect(registrarDescarga).toHaveBeenCalledWith(taller.id, datos)
    expect(firmarEnlaces).toHaveBeenCalledWith(taller.recurso)
    expect(devuelto).toEqual(enlaces)
    expect(tallerRegistrado(taller.id)).toBe(true)
  })

  it('registra antes de firmar', async () => {
    const taller = unTaller()
    const orden: string[] = []
    vi.mocked(registrarDescarga).mockImplementation(async () => {
      orden.push('registrar')
    })
    vi.mocked(firmarEnlaces).mockImplementation(async () => {
      orden.push('firmar')
      return []
    })
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useDescargarTaller(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ taller, datos })
    })
    expect(orden).toEqual(['registrar', 'firmar'])
  })

  it('un taller ya registrado en la visita no vuelve a registrarse: solo firma enlaces nuevos', async () => {
    const taller = unTaller()
    vi.mocked(firmarEnlaces).mockResolvedValue([])
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useDescargarTaller(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ taller, datos })
    })
    await act(async () => {
      await result.current.mutateAsync({ taller })
    })

    expect(registrarDescarga).toHaveBeenCalledTimes(1)
    expect(firmarEnlaces).toHaveBeenCalledTimes(2)
  })

  it('si el registro falla con un error cualquiera, no marca el taller ni firma', async () => {
    const taller = unTaller()
    vi.mocked(registrarDescarga).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useDescargarTaller(), { wrapper })

    await act(async () => {
      result.current.mutate({ taller, datos })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(tallerRegistrado(taller.id)).toBe(false)
    expect(firmarEnlaces).not.toHaveBeenCalled()
  })

  it('DA003 invalida la caché de talleres, no marca y no firma', async () => {
    const taller = unTaller()
    vi.mocked(registrarDescarga).mockRejectedValue({ code: 'DA003', message: 'no disponible' })
    const { client, wrapper } = crearContexto()
    client.setQueryData(['talleres'], [])
    const { result } = renderHook(() => useDescargarTaller(), { wrapper })

    await act(async () => {
      result.current.mutate({ taller, datos })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toMatchObject({ code: 'DA003' })
    expect(client.getQueryState(['talleres'])?.isInvalidated).toBe(true)
    expect(tallerRegistrado(taller.id)).toBe(false)
    expect(firmarEnlaces).not.toHaveBeenCalled()
  })

  it('DA004 invalida la lista de establecimientos de esa localidad y no las demás', async () => {
    const taller = unTaller()
    vi.mocked(registrarDescarga).mockRejectedValue({ code: 'DA004', message: 'no disponible' })
    const { client, wrapper } = crearContexto()
    client.setQueryData(['establecimientos', 7], [])
    client.setQueryData(['establecimientos', 8], [])
    client.setQueryData(['talleres'], [])
    const { result } = renderHook(() => useDescargarTaller(), { wrapper })

    await act(async () => {
      result.current.mutate({ taller, datos })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(client.getQueryState(['establecimientos', 7])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['establecimientos', 8])?.isInvalidated).toBe(false)
    expect(client.getQueryState(['talleres'])?.isInvalidated).toBe(false)
    expect(tallerRegistrado(taller.id)).toBe(false)
    expect(firmarEnlaces).not.toHaveBeenCalled()
  })

  it('si falla la firma después de registrar, el taller queda marcado y reintentar solo vuelve a firmar', async () => {
    const taller = unTaller()
    vi.mocked(firmarEnlaces).mockRejectedValueOnce(new Error('firma')).mockResolvedValueOnce([])
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useDescargarTaller(), { wrapper })

    await act(async () => {
      result.current.mutate({ taller, datos })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(registrarDescarga).toHaveBeenCalledTimes(1)
    expect(tallerRegistrado(taller.id)).toBe(true)

    await act(async () => {
      result.current.mutate({ taller, datos })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(registrarDescarga).toHaveBeenCalledTimes(1)
    expect(firmarEnlaces).toHaveBeenCalledTimes(2)
  })
})
