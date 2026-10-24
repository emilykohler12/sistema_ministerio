import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cerrarSesion } from './consultas'

/*
 * Contrato (#46). cerrarSesion():
 *   - signOut sin error: no toca sessionStorage ni recarga la página.
 *   - signOut con `error` o que lanza (sin red y con el access token vencido, auth-js no puede refrescar y no borra
 *     la sesión): borra CLAVE_SESION de sessionStorage y navega con carga completa a /admin/login. No rechaza.
 */
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({
  supabase: { auth: { signOut } },
  CLAVE_SESION: 'dam-sesion-test',
}))

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('location', { assign })
  sessionStorage.clear()
  sessionStorage.setItem('dam-sesion-test', '{"access_token":"vencido"}')
  sessionStorage.setItem('otra-clave', 'queda')
})

describe('cerrarSesion', () => {
  it('con el cierre exitoso no borra la clave ni recarga la página', async () => {
    signOut.mockResolvedValue({ error: null })
    await cerrarSesion()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('dam-sesion-test')).not.toBeNull()
    expect(assign).not.toHaveBeenCalled()
  })

  it('si signOut devuelve error borra la sesión y recarga en /admin/login', async () => {
    signOut.mockResolvedValue({ error: new Error('Failed to fetch') })
    await cerrarSesion()
    expect(sessionStorage.getItem('dam-sesion-test')).toBeNull()
    expect(sessionStorage.getItem('otra-clave')).toBe('queda')
    expect(assign).toHaveBeenCalledExactlyOnceWith('/admin/login')
  })

  it('si signOut devuelve error pero auth-js ya borró la sesión (token vigente, sin red) no recarga', async () => {
    signOut.mockImplementation(async () => {
      sessionStorage.removeItem('dam-sesion-test')
      return { error: new Error('Failed to fetch') }
    })
    await cerrarSesion()
    expect(assign).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('otra-clave')).toBe('queda')
  })

  it('si signOut lanza borra la sesión y recarga en /admin/login, sin rechazar', async () => {
    signOut.mockRejectedValue(new Error('red caída'))
    await expect(cerrarSesion()).resolves.toBeUndefined()
    expect(sessionStorage.getItem('dam-sesion-test')).toBeNull()
    expect(assign).toHaveBeenCalledExactlyOnceWith('/admin/login')
  })
})
