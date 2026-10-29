import { describe, expect, it } from 'vitest'
import { esquemaNuevaContrasena, esquemaRecuperacion } from './esquema'

/*
 * Contrato (#21), modulo puro:
 *   esquemaRecuperacion = z.object({ correo })
 *   esquemaNuevaContrasena = z.object({ password, confirmacion }) con error de confirmacion en path ['confirmacion'].
 *   Mensajes: 'Ingresá un correo válido'; 'La contraseña debe tener al menos 8 caracteres';
 *   'Usá como máximo 72 caracteres (menos si tiene tildes o ñ)'; 'Las contraseñas no coinciden'.
 */
function mensajes(r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) {
  return r.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []
}

describe('esquemaRecuperacion', () => {
  it('acepta un correo valido', () => {
    expect(esquemaRecuperacion.safeParse({ correo: 'admin@dam.local' }).success).toBe(true)
  })

  it('rechaza un correo mal formado con el mensaje del campo', () => {
    const r = esquemaRecuperacion.safeParse({ correo: 'no-es-un-correo' })
    expect(r.success).toBe(false)
    expect(mensajes(r)).toEqual(['correo: Ingresá un correo válido'])
  })

  it('rechaza un correo vacio', () => {
    expect(esquemaRecuperacion.safeParse({ correo: '' }).success).toBe(false)
  })
})

describe('esquemaNuevaContrasena', () => {
  const ok = (password: string, confirmacion = password) =>
    esquemaNuevaContrasena.safeParse({ password, confirmacion })

  it('acepta 8 caracteres', () => {
    expect(ok('a'.repeat(8)).success).toBe(true)
  })

  it('rechaza 7 caracteres', () => {
    const r = ok('a'.repeat(7))
    expect(r.success).toBe(false)
    expect(mensajes(r)).toContain('password: La contraseña debe tener al menos 8 caracteres')
  })

  it('acepta exactamente 72 bytes', () => {
    expect(ok('a'.repeat(72)).success).toBe(true)
  })

  it('rechaza 73 bytes', () => {
    const r = ok('a'.repeat(73))
    expect(r.success).toBe(false)
    expect(mensajes(r)).toContain(
      'password: Usá como máximo 72 caracteres (menos si tiene tildes o ñ)',
    )
  })

  it('cuenta bytes y no caracteres: 36 ñ (72 bytes) pasan', () => {
    expect(ok('ñ'.repeat(36)).success).toBe(true)
  })

  it('cuenta bytes y no caracteres: 37 ñ (37 caracteres, 74 bytes) no pasan', () => {
    const r = ok('ñ'.repeat(37))
    expect(r.success).toBe(false)
    expect(mensajes(r)).toContain(
      'password: Usá como máximo 72 caracteres (menos si tiene tildes o ñ)',
    )
  })

  it('rechaza una confirmacion distinta, con el error en el campo confirmacion', () => {
    const r = ok('clave-larga-1', 'clave-larga-2')
    expect(r.success).toBe(false)
    expect(mensajes(r)).toEqual(['confirmacion: Las contraseñas no coinciden'])
  })

  it('con contraseña corta y confirmacion distinta informa el error de la contraseña', () => {
    const r = ok('corta', 'otra')
    expect(r.success).toBe(false)
    expect(mensajes(r)).toContain('password: La contraseña debe tener al menos 8 caracteres')
  })
})
