// Siembra los usuarios de desarrollo en el Supabase LOCAL (lo corre `npm run db:reset`).
// Usa la Admin API de Auth con la clave de servicio local, no el esquema interno de auth.
//
// Credenciales de desarrollo (solo para la base local, nunca para la nube):
//   admin@dam.local         / admin-dam-local         (app_metadata.admin = true)
//   sin-permiso@dam.local   / sin-permiso-dam-local   (sin marca de admin)
//
// Es idempotente: si el usuario ya existe, lo informa y sigue.
import { execFileSync } from 'node:child_process'

const USUARIOS = [
  {
    email: 'admin@dam.local',
    password: 'admin-dam-local',
    app_metadata: { admin: true },
  },
  {
    email: 'sin-permiso@dam.local',
    password: 'sin-permiso-dam-local',
  },
]

function leerEstado() {
  const salida = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return JSON.parse(salida)
}

// Compara el hostname exacto: un prefijo aceptaría "http://localhost.evil.com".
function esUrlLocal(url) {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'http:' && (hostname === '127.0.0.1' || hostname === 'localhost')
  } catch {
    return false
  }
}

async function crearUsuario(apiUrl, clave, usuario) {
  const respuesta = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...usuario, email_confirm: true }),
  })
  if (respuesta.ok) return 'creado'
  const cuerpo = await respuesta.json().catch(() => ({}))
  if (cuerpo.error_code === 'email_exists') return 'ya existía'
  throw new Error(`${usuario.email}: ${respuesta.status} ${JSON.stringify(cuerpo)}`)
}

async function main() {
  const estado = leerEstado()
  const apiUrl = estado.API_URL
  const clave = estado.SERVICE_ROLE_KEY ?? estado.SECRET_KEY

  // Defensa: este script nunca debe apuntar a algo que no sea el Supabase local.
  if (!esUrlLocal(apiUrl)) {
    throw new Error(`API_URL no es local (${apiUrl}). Abortado.`)
  }
  if (!clave) throw new Error('No se encontró la clave de servicio local.')

  for (const usuario of USUARIOS) {
    const resultado = await crearUsuario(apiUrl, clave, usuario)
    console.log(`${usuario.email}: ${resultado}`)
  }
}

main().catch((error) => {
  console.error(`seed-usuarios: ${error.message}`)
  process.exit(1)
})
