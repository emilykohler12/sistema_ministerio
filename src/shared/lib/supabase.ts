import { createClient } from '@supabase/supabase-js'

function leerVariable(nombre: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'): string {
  const valor = import.meta.env[nombre]
  if (!valor) {
    throw new Error(`Falta la variable ${nombre}: copiala de \`npx supabase status\` a \`.env.local\`.`)
  }
  return valor
}

/**
 * Clave de la sesión en `sessionStorage`. Explícita (en vez de la derivada de la URL) para que el cierre
 * de sesión pueda borrarla cuando `signOut()` falla sin red (#46). Cambiarla cierra la sesión abierta.
 */
export const CLAVE_SESION = 'dam-auth-sesion'

export const supabase = createClient(
  leerVariable('VITE_SUPABASE_URL'),
  leerVariable('VITE_SUPABASE_PUBLISHABLE_KEY'),
  {
    auth: {
      storage: sessionStorage,
      storageKey: CLAVE_SESION,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
