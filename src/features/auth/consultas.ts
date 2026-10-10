import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'

export async function iniciarSesion(correo: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password })
  return { user: data.user, error }
}

export async function cerrarSesion(): Promise<void> {
  await supabase.auth.signOut()
}

/** Devuelve la función que cancela la suscripción. */
export function escucharSesion(
  callback: (evento: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange(callback)
  return () => data.subscription.unsubscribe()
}
