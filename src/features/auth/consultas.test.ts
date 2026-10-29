import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cambiarContrasena, cerrarSesion, pedirRecuperacion, verificarEnlace } from './consultas'

/*
 * Contrato (#46). cerrarSesion():
 *   - signOut sin error: no toca sessionStorage ni recarga la página.
 *   - signOut con `error` o que lanza (sin red y con el access token vencido, auth-js no puede refrescar y no borra
 *     la sesión): borra CLAVE_SESION de sessionStorage y navega con carga completa a /admin/login. No rechaza.
 */
const { signOut, resetPasswordForEmail, verifyOtp, updateUser } = vi.hoisted(() => ({
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('@/shared/lib/supabase', () => ({
  supabase: { auth: { signOut, resetPasswordForEmail, verifyOtp, updateUser } },
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

/*
 * Contrato (#21).
 * pedirRecuperacion(correo): Promise<'ok' | 'red'>. Llama resetPasswordForEmail(correo) sin opciones (sin redirectTo).
 *   'red' solo si la llamada lanza o el error no trae respuesta del servidor (status 0). Cualquier otro error (429, 4xx,
 *   5xx) devuelve 'ok': un 500 por SMTP solo sale para cuentas reales y revelaria cuales existen.
 * verificarEnlace(tokenHash): Promise<'ok' | 'enlace-invalido' | 'sin-permiso' | 'reintentar'>. verifyOtp({ token_hash,
 *   type: 'recovery' }) -> esAdmin(user). Solo otp_expired y user_banned son 'enlace-invalido'; cualquier otro error o
 *   rechazo es 'reintentar'. Sin la marca admin cierra la sesion y devuelve 'sin-permiso'. Con exito NO cierra la sesion.
 * cambiarContrasena(password): Promise<'ok' | 'misma-contrasena' | 'contrasena-debil' | 'reintentar'>. updateUser({ password })
 *   y, si sale bien, cerrarSesion(). Si falla NO cierra la sesion (el reintento la necesita).
 */
describe('pedirRecuperacion', () => {
  it('con exito llama resetPasswordForEmail con el correo y devuelve ok', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await expect(pedirRecuperacion('a@dam.local')).resolves.toBe('ok')
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith('a@dam.local')
  })

  it('el 429 over_email_send_rate_limit cuenta como exito', async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { code: 'over_email_send_rate_limit', status: 429, message: 'rate limit' },
    })
    await expect(pedirRecuperacion('a@dam.local')).resolves.toBe('ok')
  })

  it('un error sin respuesta del servidor (status 0) devuelve red', async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
    })
    await expect(pedirRecuperacion('a@dam.local')).resolves.toBe('red')
  })

  it('un 400 del servidor devuelve ok', async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: 'AuthApiError', code: 'validation_failed', status: 400, message: 'x' },
    })
    await expect(pedirRecuperacion('a@dam.local')).resolves.toBe('ok')
  })

  it('un 500 del servidor (por ejemplo SMTP caido) devuelve ok', async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: 'AuthApiError', code: 'unexpected_failure', status: 500, message: 'smtp' },
    })
    await expect(pedirRecuperacion('a@dam.local')).resolves.toBe('ok')
  })

  it('un AuthRetryableFetchError con status 503 (el servidor respondio) devuelve ok', async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: 'AuthRetryableFetchError', status: 503, message: 'Service Unavailable' },
    })
    await expect(pedirRecuperacion('a@dam.local')).resolves.toBe('ok')
  })

  it('si resetPasswordForEmail lanza devuelve red sin rechazar', async () => {
    resetPasswordForEmail.mockRejectedValue(new Error('red caida'))
    await expect(pedirRecuperacion('a@dam.local')).resolves.toBe('red')
  })
})

describe('verificarEnlace', () => {
  const admin = {
    data: { user: { id: 'u1', app_metadata: { admin: true } }, session: {} },
    error: null,
  }
  const errorRed = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }

  beforeEach(() => {
    signOut.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue(admin)
  })

  it('verifica el token con type recovery y devuelve ok sin cerrar la sesion', async () => {
    await expect(verificarEnlace('hash1')).resolves.toBe('ok')
    expect(verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: 'hash1', type: 'recovery' })
    expect(signOut).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('una cuenta sin la marca admin cierra la sesion y devuelve sin-permiso', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: 'u2', app_metadata: {} }, session: {} },
      error: null,
    })
    await expect(verificarEnlace('hash1')).resolves.toBe('sin-permiso')
    expect(updateUser).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it.each(['otp_expired', 'user_banned'])('verifyOtp con %s devuelve enlace-invalido', async (code) => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code, status: 403, message: 'x' },
    })
    await expect(verificarEnlace('hash1')).resolves.toBe('enlace-invalido')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('un error de red en verifyOtp devuelve reintentar', async () => {
    verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: errorRed })
    await expect(verificarEnlace('hash1')).resolves.toBe('reintentar')
  })

  it('un error desconocido del servidor en verifyOtp devuelve reintentar, no enlace-invalido', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', code: 'unexpected_failure', status: 500, message: 'x' },
    })
    await expect(verificarEnlace('hash1')).resolves.toBe('reintentar')
  })

  it('si verifyOtp lanza devuelve reintentar sin rechazar', async () => {
    verifyOtp.mockRejectedValue(new Error('red caida'))
    await expect(verificarEnlace('hash1')).resolves.toBe('reintentar')
  })
})

describe('cambiarContrasena', () => {
  const errorRed = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }

  beforeEach(() => {
    signOut.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ data: { user: {} }, error: null })
  })

  it('actualiza la contraseña y despues cierra la sesion, en ese orden', async () => {
    const orden: string[] = []
    updateUser.mockImplementation(async () => (orden.push('updateUser'), { data: {}, error: null }))
    signOut.mockImplementation(async () => (orden.push('signOut'), { error: null }))
    await expect(cambiarContrasena('nueva-clave-1')).resolves.toBe('ok')
    expect(orden).toEqual(['updateUser', 'signOut'])
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'nueva-clave-1' })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('same_password devuelve misma-contrasena y no cierra la sesion', async () => {
    updateUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'same_password', status: 422, message: 'x' },
    })
    await expect(cambiarContrasena('vieja-clave-1')).resolves.toBe('misma-contrasena')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('weak_password devuelve contrasena-debil', async () => {
    updateUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'weak_password', status: 422, message: 'x' },
    })
    await expect(cambiarContrasena('password')).resolves.toBe('contrasena-debil')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('un error de red en updateUser devuelve reintentar y no cierra la sesion', async () => {
    updateUser.mockResolvedValue({ data: { user: null }, error: errorRed })
    await expect(cambiarContrasena('nueva-clave-1')).resolves.toBe('reintentar')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('un error desconocido en updateUser devuelve reintentar', async () => {
    updateUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', code: 'unexpected_failure', status: 500, message: 'x' },
    })
    await expect(cambiarContrasena('nueva-clave-1')).resolves.toBe('reintentar')
  })

  it('si updateUser lanza devuelve reintentar sin rechazar', async () => {
    updateUser.mockRejectedValue(new Error('red caida'))
    await expect(cambiarContrasena('nueva-clave-1')).resolves.toBe('reintentar')
    expect(signOut).not.toHaveBeenCalled()
  })
})
