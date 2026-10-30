import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearWrapperQuery } from '@/test/utils'
import { useSolicitarRecuperacion } from './useSolicitarRecuperacion'

/*
 * Contrato: useSolicitarRecuperacion() es un useMutation cuyo mutationFn(correo: string) llama
 * pedirRecuperacion(correo) y resuelve 'ok' | 'red'. Un rechazo de consultas pasa a 'red'.
 */
const { pedirRecuperacion } = vi.hoisted(() => ({ pedirRecuperacion: vi.fn() }))
vi.mock('@/features/auth/consultas', () => ({ pedirRecuperacion }))

beforeEach(() => vi.clearAllMocks())

describe('useSolicitarRecuperacion', () => {
  it('llama a pedirRecuperacion con el correo y resuelve ok', async () => {
    pedirRecuperacion.mockResolvedValue('ok')
    const { result } = renderHook(() => useSolicitarRecuperacion(), { wrapper: crearWrapperQuery() })
    let r: unknown
    await act(async () => {
      r = await result.current.mutateAsync('a@dam.local')
    })
    expect(r).toBe('ok')
    expect(pedirRecuperacion).toHaveBeenCalledExactlyOnceWith('a@dam.local')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('propaga red', async () => {
    pedirRecuperacion.mockResolvedValue('red')
    const { result } = renderHook(() => useSolicitarRecuperacion(), { wrapper: crearWrapperQuery() })
    let r: unknown
    await act(async () => {
      r = await result.current.mutateAsync('a@dam.local')
    })
    expect(r).toBe('red')
  })

  it('si consultas rechaza, resuelve red sin rechazar', async () => {
    pedirRecuperacion.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSolicitarRecuperacion(), { wrapper: crearWrapperQuery() })
    let r: unknown
    await act(async () => {
      r = await result.current.mutateAsync('a@dam.local')
    })
    expect(r).toBe('red')
  })
})
