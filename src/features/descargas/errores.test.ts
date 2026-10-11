import { describe, expect, it } from 'vitest'
import { esInstitucionNoDisponible, esTallerNoDisponible, mensajeDeErrorDescarga } from './errores'

/*
 * Contrato (corte descargas, criterio 5). src/features/descargas/errores.ts, puro, sin imports de supabase:
 *   esTallerNoDisponible(error: unknown): boolean         // code === 'DA003'
 *   esInstitucionNoDisponible(error: unknown): boolean    // code === 'DA004'
 *   mensajeDeErrorDescarga(error: unknown): string
 *     DA003 -> "Este taller ya no está disponible"
 *     DA004 -> "La institución elegida ya no está disponible"
 *     otro  -> mensaje genérico (no vacío, sin ninguno de los dos anteriores)
 */
describe('esTallerNoDisponible', () => {
  it('es verdadero solo para DA003', () => {
    expect(esTallerNoDisponible({ code: 'DA003', message: 'x' })).toBe(true)
  })

  it('es falso para otros códigos y valores', () => {
    for (const e of [{ code: 'DA004' }, { code: '23514' }, new Error('sin red'), null, undefined, 'DA003']) {
      expect(esTallerNoDisponible(e)).toBe(false)
    }
  })
})

describe('esInstitucionNoDisponible', () => {
  it('es verdadero solo para DA004', () => {
    expect(esInstitucionNoDisponible({ code: 'DA004', message: 'x' })).toBe(true)
  })

  it('es falso para otros códigos y valores', () => {
    for (const e of [{ code: 'DA003' }, { code: '23514' }, new Error('sin red'), null, undefined, 'DA004']) {
      expect(esInstitucionNoDisponible(e)).toBe(false)
    }
  })
})

describe('mensajeDeErrorDescarga', () => {
  it('DA003 dice que el taller ya no está disponible', () => {
    expect(mensajeDeErrorDescarga({ code: 'DA003' })).toBe('Este taller ya no está disponible')
  })

  it('DA004 dice que la institución elegida ya no está disponible', () => {
    expect(mensajeDeErrorDescarga({ code: 'DA004' })).toBe('La institución elegida ya no está disponible')
  })

  it('cualquier otro error da un mensaje genérico', () => {
    for (const e of [new Error('sin red'), { code: '42501' }, { code: '23514' }, null, undefined, 'texto']) {
      const mensaje = mensajeDeErrorDescarga(e)
      expect(mensaje.length).toBeGreaterThan(0)
      expect(mensaje).not.toMatch(/ya no está disponible/)
    }
  })
})
