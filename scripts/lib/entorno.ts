// Destino de los scripts que escriben en Supabase (ADR 0019). Puro: no lee process.env ni la base.
// Lo importan los scripts (`importar-padron.ts`, `seed-usuarios.mjs`) con import relativo `.ts`: Node 24 lo ejecuta sin compilar.

export type Env = Record<string, string | undefined>

export type Destino =
  | { modo: 'local' }
  | { modo: 'nube'; url: string; host: string; clave: string }

/** Compara el hostname exacto: un prefijo aceptaría "http://localhost.evil.com". */
export function esUrlLocal(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'http:' && (hostname === '127.0.0.1' || hostname === 'localhost')
  } catch {
    return false
  }
}

function hostConfirmado(args: string[]): string | null {
  for (const arg of args) {
    if (arg === '--confirmar') return ''
    if (arg.startsWith('--confirmar=')) return arg.slice('--confirmar='.length)
  }
  return null
}

/**
 * Sin `SUPABASE_URL` (o con una URL local) el destino es el Supabase local. Con una URL remota exige la clave de
 * servicio y `--confirmar=<host>` igual al host de la URL; si falta algo lanza antes de que nadie lea la base.
 */
export function resolverDestino(env: Env, args: string[]): Destino {
  const url = env.SUPABASE_URL
  if (!url) return { modo: 'local' }
  if (esUrlLocal(url)) return { modo: 'local' }

  let host: string
  try {
    host = new URL(url).host
  } catch {
    throw new Error(`SUPABASE_URL no es una URL válida: ${url}`)
  }

  const clave = env.SUPABASE_SERVICE_ROLE_KEY
  if (!clave) throw new Error('Con una SUPABASE_URL remota hace falta SUPABASE_SERVICE_ROLE_KEY.')

  const confirmado = hostConfirmado(args)
  if (!confirmado) {
    throw new Error(`Destino remoto (${host}): confirmá el host con --confirmar=${host}.`)
  }
  if (confirmado !== host) {
    throw new Error(`--confirmar=${confirmado} no coincide con el host de SUPABASE_URL (${host}).`)
  }

  return { modo: 'nube', url, host, clave }
}
