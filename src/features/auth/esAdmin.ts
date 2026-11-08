import type { Session, User } from '@supabase/supabase-js'

/** Solo UX: la barrera real es `es_admin()` en la RLS. Módulo puro: no importa el cliente. */
export function esAdmin(user: User | null | undefined): boolean {
  return user?.app_metadata?.admin === true
}

function payloadDelToken(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string') return null
  const parte = token.split('.')[1]
  if (!parte) return null
  try {
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/')
    const binario = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const json = new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)))
    const payload: unknown = JSON.parse(json)
    return payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * La sesión que abre `verifyOtp` en la recuperación de contraseña: su access token trae `amr` con
 * `otp` como único método (el login con contraseña trae `password`). No debe habilitar `/admin`
 * hasta que se cambie la contraseña (#53). Solo UX; tolera tokens mal formados (devuelve false).
 */
export function esSesionDeRecuperacion(session: Session | null | undefined): boolean {
  const amr = payloadDelToken(session?.access_token)?.amr
  if (!Array.isArray(amr) || amr.length === 0) return false
  return amr.every(
    (m) => m !== null && typeof m === 'object' && (m as { method?: unknown }).method === 'otp',
  )
}
