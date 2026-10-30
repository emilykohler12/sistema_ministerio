import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearWrapperQuery } from '@/test/utils'
import { useRestablecerContrasena } from './useRestablecerContrasena'

/*
 * Contrato: useRestablecerContrasena() es un useMutation cuyo mutationFn({ tokenHash, password }) verifica el enlace
 * (verificarEnlace(tokenHash)) y, si salio bien, cambia la contraseña (cambiarContrasena(password)); resuelve el codigo.
 * Un solo ref recuerda que el token ya se consumio: tras 'misma-contrasena', 'contrasena-debil' o 'reintentar' de
 * cambiarContrasena el siguiente llamado no vuelve a verificar. Tras 'enlace-invalido', 'sin-permiso' o 'reintentar'
 * de verificarEnlace sigue verificando. Si verificarEnlace no devuelve 'ok', no se llama a cambiarContrasena.
 */
const { verificarEnlace, cambiarContrasena } = vi.hoisted(() => ({
  verificarEnlace: vi.fn(),
  cambiarContrasena: vi.fn(),
}))
vi.mock('@/features/auth/consultas', () => ({ verificarEnlace, cambiarContrasena }))

beforeEach(() => vi.clearAllMocks())

async function enviar(
  result: { current: ReturnType<typeof useRestablecerContrasena> },
  password = 'nueva-clave-1',
) {
  let r: unknown
  await act(async () => {
    r = await result.current.mutateAsync({ tokenHash: 'tok', password })
  })
  return r
}

describe('useRestablecerContrasena', () => {
  it('la primera vez verifica el enlace y despues cambia la contraseña, y devuelve el codigo', async () => {
    verificarEnlace.mockResolvedValue('ok')
    cambiarContrasena.mockResolvedValue('ok')
    const { result } = renderHook(() => useRestablecerContrasena(), { wrapper: crearWrapperQuery() })
    expect(await enviar(result)).toBe('ok')
    expect(verificarEnlace).toHaveBeenCalledExactlyOnceWith('tok')
    expect(cambiarContrasena).toHaveBeenCalledExactlyOnceWith('nueva-clave-1')
    expect(verificarEnlace.mock.invocationCallOrder[0]).toBeLessThan(
      cambiarContrasena.mock.invocationCallOrder[0],
    )
  })

  it.each(['misma-contrasena', 'contrasena-debil', 'reintentar'])(
    'tras %s al cambiar la contraseña el reintento no vuelve a verificar el token',
    async (codigo) => {
      verificarEnlace.mockResolvedValue('ok')
      cambiarContrasena.mockResolvedValueOnce(codigo).mockResolvedValueOnce('ok')
      const { result } = renderHook(() => useRestablecerContrasena(), { wrapper: crearWrapperQuery() })
      await enviar(result, 'primera-clave')
      expect(await enviar(result, 'segunda-clave')).toBe('ok')
      expect(verificarEnlace).toHaveBeenCalledTimes(1)
      expect(cambiarContrasena).toHaveBeenNthCalledWith(1, 'primera-clave')
      expect(cambiarContrasena).toHaveBeenNthCalledWith(2, 'segunda-clave')
    },
  )

  it.each(['enlace-invalido', 'sin-permiso', 'reintentar'])(
    'tras %s al verificar el enlace no cambia la contraseña y el reintento vuelve a verificar',
    async (codigo) => {
      verificarEnlace.mockResolvedValueOnce(codigo).mockResolvedValueOnce('ok')
      cambiarContrasena.mockResolvedValue('ok')
      const { result } = renderHook(() => useRestablecerContrasena(), { wrapper: crearWrapperQuery() })
      expect(await enviar(result)).toBe(codigo)
      expect(cambiarContrasena).not.toHaveBeenCalled()
      expect(await enviar(result)).toBe('ok')
      expect(verificarEnlace).toHaveBeenCalledTimes(2)
      expect(cambiarContrasena).toHaveBeenCalledExactlyOnceWith('nueva-clave-1')
    },
  )
})
