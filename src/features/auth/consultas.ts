import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { CLAVE_SESION, supabase } from '@/shared/lib/supabase'

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

/** Devuelve la función que cancela la suscripción. */
export function escucharSesion(
  callback: (evento: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange(callback)
  return () => data.subscription.unsubscribe()
}
