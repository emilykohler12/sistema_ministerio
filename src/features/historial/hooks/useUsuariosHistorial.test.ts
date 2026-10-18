import { QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { obtenerUsuariosHistorial } from '../consultas'
import type { UsuarioHistorial } from '../types'
import { useUsuariosHistorial } from './useUsuariosHistorial'

/*
 * Contrato (spec Diseño):
 *   useUsuariosHistorial(): UseQueryResult<UsuarioHistorial[]>
 *   - queryKey ['historial', 'usuarios']; queryFn: obtenerUsuariosHistorial()
 */
vi.mock('../consultas', () => ({ obtenerUsuariosHistorial: vi.fn() }))

const usuarios: UsuarioHistorial[] = [
  { id: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', email: 'admin@dam.local' },
  { id: '7a1b2c3d-0000-4000-8000-000000000001', email: 'otra@dam.local' },
]

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUsuariosHistorial', () => {
  it('devuelve los usuarios con operaciones', async () => {
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useUsuariosHistorial(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(usuarios)
  })

  it('usa la clave ["historial", "usuarios"]', async () => {
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    const { client, wrapper } = crearContexto()
    const { result } = renderHook(() => useUsuariosHistorial(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryData(['historial', 'usuarios'])).toEqual(usuarios)
  })

  it('si la consulta rechaza, el hook queda en error', async () => {
    vi.mocked(obtenerUsuariosHistorial).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useUsuariosHistorial(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
