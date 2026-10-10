import { QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { guardarConfiguracion, obtenerConfiguracion } from '../consultas'
import type { Configuracion } from '../types'
import { useConfiguracion, useGuardarConfiguracion } from './useConfiguracion'

/*
 * Contrato de consultas.ts (decisión 0012): las dos funciones lanzan ante cualquier error.
 *   obtenerConfiguracion(): Promise<Configuracion>
 *   guardarConfiguracion(cambios: ConfiguracionCambios): Promise<Configuracion>
 * La caché usa la clave ['configuracion'].
 */
vi.mock('../consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
}))

const fila: Configuracion = {
  id: 1,
  nombre: 'Ministerio de Educación de Misiones',
  logo_ruta: null,
  telefono: '',
  correo: '',
  direccion: '',
  facebook: '',
  instagram: '',
  quienes_somos: '',
  mision: 'Misión original',
  vision: '',
  updated_at: '2026-10-10T00:00:00Z',
}

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useConfiguracion', () => {
  it('devuelve lo que resuelve obtenerConfiguracion', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue(fila)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useConfiguracion(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(fila)
  })
})

describe('useGuardarConfiguracion', () => {
  it('llama a guardarConfiguracion con los cambios y deja en caché la fila devuelta, no los cambios', async () => {
    const devuelta: Configuracion = { ...fila, mision: 'Misión nueva', updated_at: '2026-10-11T00:00:00Z' }
    vi.mocked(guardarConfiguracion).mockResolvedValue(devuelta)
    const { client, wrapper } = crearContexto()
    client.setQueryData(['configuracion'], fila)
    const { result } = renderHook(() => useGuardarConfiguracion(), { wrapper })

    const cambios = { mision: 'Misión nueva' }
    result.current.mutate(cambios)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(guardarConfiguracion).toHaveBeenCalledTimes(1)
    expect(vi.mocked(guardarConfiguracion).mock.calls[0][0]).toEqual(cambios)
    expect(client.getQueryData(['configuracion'])).toEqual(devuelta)
  })

  it('si guardarConfiguracion rechaza, la mutation queda en error y la caché no cambia', async () => {
    vi.mocked(guardarConfiguracion).mockRejectedValue(new Error('RLS'))
    const { client, wrapper } = crearContexto()
    client.setQueryData(['configuracion'], fila)
    const { result } = renderHook(() => useGuardarConfiguracion(), { wrapper })

    result.current.mutate({ mision: 'Misión nueva' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData(['configuracion'])).toEqual(fila)
  })
})
