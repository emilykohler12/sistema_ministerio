import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConAuth, sesionAdmin, sesionSinMarca, simularSesion } from '@/test/auth'
import { useAuth } from './AuthContext'
import { cerrarSesion, iniciarSesion } from './consultas'

/*
 * Contrato de '@/features/auth/consultas' (envoltorios de supabase.auth):
 *   iniciarSesion(correo, password): Promise<{ user: User | null; error: { code?: string; message: string } | null }>
 *   cerrarSesion(): Promise<void>
 *   escucharSesion(cb: (evento: string, session: Session | null) => void): () => void   (devuelve la baja)
 * Contrato de useAuth(): { usuario: { id, email } | null, cargando, iniciarSesion(correo, pass), cerrarSesion() }
 *   iniciarSesion devuelve 'credenciales' | 'sin-permiso' | 'red' | null.
 */
vi.mock('@/features/auth/consultas', () => ({
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  escucharSesion: vi.fn(),
}))

let client: QueryClient
let emitir: ReturnType<typeof simularSesion>['emitir']
let desuscribir: ReturnType<typeof simularSesion>['desuscribir']

function montar() {
  function Wrapper({ children }: { children: ReactNode }) {
    return <ConAuth client={client}>{children}</ConAuth>
  }
  return renderHook(() => useAuth(), { wrapper: Wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient()
  ;({ emitir, desuscribir } = simularSesion())
})

describe('AuthProvider', () => {
  it('antes del evento inicial está cargando y sin usuario', () => {
    const { result } = montar()
    expect(result.current.cargando).toBe(true)
    expect(result.current.usuario).toBeNull()
  })

  it('INITIAL_SESSION con un admin restaura { id, email } y deja de cargar', () => {
    const { result } = montar()
    emitir('INITIAL_SESSION', sesionAdmin)
    expect(result.current.usuario).toEqual({ id: 'u1', email: 'admin@dam.local' })
    expect(result.current.cargando).toBe(false)
  })

  it('INITIAL_SESSION con null deja usuario en null y deja de cargar', () => {
    const { result } = montar()
    emitir('INITIAL_SESSION', null)
    expect(result.current.usuario).toBeNull()
    expect(result.current.cargando).toBe(false)
  })

  it('una sesión sin la marca nunca es usuario y se cierra de forma diferida', async () => {
    const { result } = montar()
    emitir('INITIAL_SESSION', sesionSinMarca)
    expect(result.current.usuario).toBeNull()
    expect(result.current.cargando).toBe(false)
    // No se llama a supabase.auth.* sincrónicamente dentro del callback.
    expect(cerrarSesion).not.toHaveBeenCalled()
    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1))
    expect(result.current.usuario).toBeNull()
  })

  it('SIGNED_IN con una sesión sin la marca tampoco es usuario', async () => {
    const { result } = montar()
    emitir('INITIAL_SESSION', null)
    emitir('SIGNED_IN', sesionSinMarca)
    expect(result.current.usuario).toBeNull()
    expect(cerrarSesion).not.toHaveBeenCalled()
    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1))
  })

  it('si el cierre diferido rechaza, no queda una promesa suelta', async () => {
    vi.mocked(cerrarSesion).mockRejectedValue(new Error('sin red'))
    const { result } = montar()
    emitir('INITIAL_SESSION', sesionSinMarca)
    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1))
    // Si el rechazo quedara sin capturar, Vitest fallaría la corrida por "unhandled rejection".
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.usuario).toBeNull()
  })

  it('SIGNED_OUT limpia usuario y la caché de React Query', () => {
    const clear = vi.spyOn(client, 'clear')
    const { result } = montar()
    emitir('INITIAL_SESSION', sesionAdmin)
    expect(clear).not.toHaveBeenCalled()
    emitir('SIGNED_OUT', null)
    expect(result.current.usuario).toBeNull()
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('un cambio de usuario (anon a admin) limpia la caché de React Query', () => {
    client.setQueryData(['categorias'], [{ id: 1 }])
    const clear = vi.spyOn(client, 'clear')
    montar()
    emitir('INITIAL_SESSION', null)
    expect(clear).not.toHaveBeenCalled()
    emitir('SIGNED_IN', sesionAdmin)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(['categorias'])).toBeUndefined()
  })

  it('INITIAL_SESSION no limpia la caché, ni siquiera con un admin', () => {
    const clear = vi.spyOn(client, 'clear')
    montar()
    emitir('INITIAL_SESSION', sesionAdmin)
    expect(clear).not.toHaveBeenCalled()
  })

  it('un SIGNED_IN repetido del mismo usuario (al volver el foco) no limpia la caché', () => {
    const clear = vi.spyOn(client, 'clear')
    montar()
    emitir('INITIAL_SESSION', sesionAdmin)
    emitir('SIGNED_IN', sesionAdmin)
    expect(clear).not.toHaveBeenCalled()
  })

  it('al desmontar se desuscribe', () => {
    const { unmount } = montar()
    expect(desuscribir).not.toHaveBeenCalled()
    unmount()
    expect(desuscribir).toHaveBeenCalled()
  })

  it('expone cerrarSesion de las consultas', () => {
    const { result } = montar()
    expect(result.current.cerrarSesion).toBe(cerrarSesion)
  })
})

describe('iniciarSesion', () => {
  it("devuelve 'credenciales' con error invalid_credentials", async () => {
    vi.mocked(iniciarSesion).mockResolvedValue({
      user: null,
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    } as never)
    const { result } = montar()
    let r: unknown
    await act(async () => {
      r = await result.current.iniciarSesion('admin@dam.local', 'mala')
    })
    expect(r).toBe('credenciales')
    expect(iniciarSesion).toHaveBeenCalledWith('admin@dam.local', 'mala')
  })

  it("devuelve 'red' ante cualquier otro error", async () => {
    vi.mocked(iniciarSesion).mockResolvedValue({
      user: null,
      error: { message: 'Failed to fetch' },
    } as never)
    const { result } = montar()
    let r: unknown
    await act(async () => {
      r = await result.current.iniciarSesion('admin@dam.local', 'x')
    })
    expect(r).toBe('red')
  })

  it("devuelve 'red' si la consulta lanza", async () => {
    vi.mocked(iniciarSesion).mockRejectedValue(new Error('storage lleno'))
    const { result } = montar()
    let r: unknown
    await act(async () => {
      r = await result.current.iniciarSesion('admin@dam.local', 'x')
    })
    expect(r).toBe('red')
  })

  it("devuelve 'sin-permiso' si el user no es admin y no cierra la sesión sincrónicamente", async () => {
    vi.mocked(iniciarSesion).mockResolvedValue({
      user: sesionSinMarca.user,
      error: null,
    } as never)
    const { result } = montar()
    let r: unknown
    await act(async () => {
      r = await result.current.iniciarSesion('sin-permiso@dam.local', 'x')
    })
    expect(r).toBe('sin-permiso')
    // El cierre lo hace el callback de onAuthStateChange, no iniciarSesion.
    expect(cerrarSesion).not.toHaveBeenCalled()
  })

  it('devuelve null si sale bien', async () => {
    vi.mocked(iniciarSesion).mockResolvedValue({ user: sesionAdmin.user, error: null } as never)
    const { result } = montar()
    let r: unknown
    await act(async () => {
      r = await result.current.iniciarSesion('admin@dam.local', 'ok')
    })
    expect(r).toBeNull()
  })
})
