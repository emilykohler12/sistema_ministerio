import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { esAdmin } from './esAdmin'

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
