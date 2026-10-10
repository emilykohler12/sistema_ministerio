import { createClient } from '@supabase/supabase-js'

function leerVariable(nombre: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'): string {
  const valor = import.meta.env[nombre]
  if (!valor) {
    throw new Error(`Falta la variable ${nombre}: copiala de \`npx supabase status\` a \`.env.local\`.`)
  }
  return valor
}

export const supabase = createClient(
  leerVariable('VITE_SUPABASE_URL'),
  leerVariable('VITE_SUPABASE_PUBLISHABLE_KEY'),
  {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
