// Siembra los usuarios de desarrollo en el Supabase LOCAL (lo corre `npm run db:reset`).
// Usa la Admin API de Auth con la clave de servicio local, no el esquema interno de auth.
//
// Credenciales de desarrollo (solo para la base local, nunca para la nube):
//   admin@dam.local         / admin-dam-local         (app_metadata.admin = true)
//   sin-permiso@dam.local   / sin-permiso-dam-local   (sin marca de admin)
//
// Es idempotente: si el usuario ya existe, lo informa y sigue.
import { supabaseLocal } from './lib/supabaseLocal.ts'

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
  // supabaseLocal exige que la API sea local y que exista la clave de servicio.
  const { url, clave } = supabaseLocal()

  for (const usuario of USUARIOS) {
    const resultado = await crearUsuario(url, clave, usuario)
    console.log(`${usuario.email}: ${resultado}`)
  }
}

main().catch((error) => {
  console.error(`seed-usuarios: ${error.message}`)
  process.exit(1)
})
