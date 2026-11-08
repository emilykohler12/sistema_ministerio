import type { Session, User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { esAdmin, esSesionDeRecuperacion } from './esAdmin'

function usuario(parcial: Record<string, unknown>) {
  return { id: 'u1', email: 'x@dam.local', ...parcial } as unknown as User
}

describe('esAdmin', () => {
  it('es true solo con app_metadata.admin === true', () => {
    expect(esAdmin(usuario({ app_metadata: { admin: true } }))).toBe(true)
  })

  it('es false si la marca está solo en user_metadata', () => {
    expect(esAdmin(usuario({ user_metadata: { admin: true } }))).toBe(false)
    expect(esAdmin(usuario({ app_metadata: {}, user_metadata: { admin: true } }))).toBe(false)
  })

  it('es false si la marca es el string "true"', () => {
    expect(esAdmin(usuario({ app_metadata: { admin: 'true' } }))).toBe(false)
  })

  it('es false con user null o undefined', () => {
    expect(esAdmin(null)).toBe(false)
    expect(esAdmin(undefined)).toBe(false)
  })

  it('es false con app_metadata vacío', () => {
    expect(esAdmin(usuario({ app_metadata: {} }))).toBe(false)
  })
})

function base64url(texto: string) {
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sesionConToken(payload: Record<string, unknown>) {
  const token = `${base64url('{"alg":"HS256"}')}.${base64url(JSON.stringify(payload))}.firma`
  return { access_token: token } as unknown as Session
}

describe('esSesionDeRecuperacion', () => {
  // Decodifica el payload del access_token (base64url) sin importar el cliente de supabase.
  it('es true si el único método de autenticación es otp', () => {
    expect(esSesionDeRecuperacion(sesionConToken({ amr: [{ method: 'otp', timestamp: 1 }] }))).toBe(true)
  })

  it('es false con login por contraseña', () => {
    expect(esSesionDeRecuperacion(sesionConToken({ amr: [{ method: 'password', timestamp: 1 }] }))).toBe(false)
  })

  it('es false si hay otp junto con otro método', () => {
    expect(
      esSesionDeRecuperacion(sesionConToken({ amr: [{ method: 'password' }, { method: 'otp' }] })),
    ).toBe(false)
  })

  it('es false sin amr o con amr vacío o mal formado', () => {
    expect(esSesionDeRecuperacion(sesionConToken({}))).toBe(false)
    expect(esSesionDeRecuperacion(sesionConToken({ amr: [] }))).toBe(false)
    expect(esSesionDeRecuperacion(sesionConToken({ amr: 'otp' }))).toBe(false)
    expect(esSesionDeRecuperacion(sesionConToken({ amr: [null] }))).toBe(false)
  })

  it('es false con token mal formado o sesión nula', () => {
    expect(esSesionDeRecuperacion({ access_token: 'no-es-un-jwt' } as unknown as Session)).toBe(false)
    expect(esSesionDeRecuperacion({ access_token: 'a.%%%.c' } as unknown as Session)).toBe(false)
    expect(esSesionDeRecuperacion({ access_token: `a.${base64url('no json')}.c` } as unknown as Session)).toBe(false)
    expect(esSesionDeRecuperacion({} as unknown as Session)).toBe(false)
    expect(esSesionDeRecuperacion(null)).toBe(false)
    expect(esSesionDeRecuperacion(undefined)).toBe(false)
  })
})
