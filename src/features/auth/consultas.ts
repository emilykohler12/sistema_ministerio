import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { CLAVE_SESION, supabase } from '@/shared/lib/supabase'
import { esAdmin } from './esAdmin'

export async function iniciarSesion(correo: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password })
  return { user: data.user, error }
}

/**
 * Cierra la sesión. Sin red y con el access token vencido, auth-js no puede refrescarlo, `signOut()` devuelve
 * el error y no borra la sesión (el scope 'local' pasa por el mismo camino). Si la clave sigue en storage se
 * descarta a mano y se recarga con carga completa: el cliente en memoria es lo único que podría refrescarla al
 * volver la red. Si ya no está (token vigente), auth-js la borró y avisó: no se recarga.
 */
export async function cerrarSesion(): Promise<void> {
  let fallo = false
  try {
    const { error } = await supabase.auth.signOut()
    fallo = error !== null
  } catch {
    fallo = true
  }
  if (!fallo) return
  // Con el token vigente y sin red, auth-js ya borró la sesión y emitió SIGNED_OUT antes de devolver el error:
  // no hay nada que descartar y recargar sin red mostraría la página de error del navegador.
  if (sessionStorage.getItem(CLAVE_SESION) === null) return
  sessionStorage.removeItem(CLAVE_SESION)
  sessionStorage.removeItem(`${CLAVE_SESION}-code-verifier`)
  window.location.assign('/admin/login')
}

export type ResultadoVerificar = 'ok' | 'enlace-invalido' | 'sin-permiso' | 'reintentar'
export type ResultadoCambiar = 'ok' | 'misma-contrasena' | 'contrasena-debil' | 'reintentar'

/**
 * Pide el correo de recuperación. No revela si la cuenta existe: GoTrue solo intenta mandar el correo si la cuenta
 * existe, así que un 429 o un 500 por SMTP salen solo para cuentas reales. Por eso cualquier respuesta del servidor
 * (4xx, 5xx, incluido un AuthRetryableFetchError con status 502-504) cuenta como 'ok'. Solo es 'red' lo que no obtuvo
 * respuesta: la llamada lanza o auth-js informa `status` 0 (fallo de fetch). Sin `redirectTo`: el enlace lo arma la
 * plantilla del correo.
 */
export async function pedirRecuperacion(correo: string): Promise<'ok' | 'red'> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(correo)
    return error?.status === 0 ? 'red' : 'ok'
  } catch {
    return 'red'
  }
}

/**
 * Consume el `token_hash` (verifyOtp abre una sesión de recuperación) y comprueba la marca admin. Sin ella cierra la
 * sesión. Con éxito NO la cierra: la necesita `cambiarContrasena`. Solo `otp_expired` y `user_banned` prueban que el
 * enlace no sirve; cualquier otro error (red, 5xx, desconocido) es 'reintentar' porque no se sabe si el token se gastó.
 * Nunca rechaza.
 */
export async function verificarEnlace(tokenHash: string): Promise<ResultadoVerificar> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (error) {
      return error.code === 'otp_expired' || error.code === 'user_banned'
        ? 'enlace-invalido'
        : 'reintentar'
    }
    if (!esAdmin(data.user)) {
      await cerrarSesion()
      return 'sin-permiso'
    }
    return 'ok'
  } catch {
    return 'reintentar'
  }
}

/**
 * Fija la contraseña con la sesión de recuperación y la cierra (`signOut` es global por defecto). Si falla no cierra
 * la sesión: el reintento la necesita. Nunca rechaza.
 */
export async function cambiarContrasena(password: string): Promise<ResultadoCambiar> {
  try {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      if (error.code === 'same_password') return 'misma-contrasena'
      if (error.code === 'weak_password') return 'contrasena-debil'
      return 'reintentar'
    }
  } catch {
    return 'reintentar'
  }
  await cerrarSesion()
  return 'ok'
}

/** Devuelve la función que cancela la suscripción. */
export function escucharSesion(
  callback: (evento: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange(callback)
  return () => data.subscription.unsubscribe()
}
