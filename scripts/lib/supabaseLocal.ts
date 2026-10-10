// Credenciales del Supabase LOCAL, leídas de `supabase status`. Es la guardia que impide que un script que escribe con
// la clave de servicio apunte a la nube por la rama local. La usan `seed-usuarios.mjs` e `importar-padron.ts`.
import { execFileSync } from 'node:child_process'
import { esUrlLocal } from './entorno.ts'

export function supabaseLocal(): { url: string; clave: string } {
  const salida = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const estado = JSON.parse(salida) as { API_URL?: string; SERVICE_ROLE_KEY?: string; SECRET_KEY?: string }
  const url = estado.API_URL
  const clave = estado.SERVICE_ROLE_KEY ?? estado.SECRET_KEY

  // Defensa: nunca debe apuntar a algo que no sea el Supabase local.
  if (!url || !esUrlLocal(url)) throw new Error(`API_URL no es local (${url}). Abortado.`)
  if (!clave) throw new Error('No se encontró la clave de servicio local.')
  return { url, clave }
}
