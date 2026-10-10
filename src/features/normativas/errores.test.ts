import { describe, expect, it } from 'vitest'
import { MOTIVO_FORMATO, MOTIVO_TAMANIO } from './archivos'
import { mensajeDeErrorNormativa } from './errores'

/*
 * Contrato de src/features/normativas/errores.ts (puro, sin imports de supabase; criterios 1 y 2):
 *   mensajeDeErrorNormativa(error: unknown): string
 *     code '23505' (unicidad de número + año)      -> mensaje que menciona "número" y "año" (y que ya existe)
 *     413 / 415 en `status` o en `statusCode`, número o texto (forma de storage-js) -> MOTIVO_TAMANIO / MOTIVO_FORMATO
 *       (los mismos que da validarPdf antes de subir)
 *     cualquier otra cosa                          -> mensaje genérico que no menciona número/año, tamaño ni formato
 */

describe('mensajeDeErrorNormativa', () => {
  it('23505 informa que ya existe una normativa con ese número y año', () => {
    const mensaje = mensajeDeErrorNormativa({ code: '23505', message: 'duplicate key' })
    expect(mensaje).toMatch(/número/i)
    expect(mensaje).toMatch(/año/i)
    expect(mensaje).toMatch(/ya existe/i)
  })

  it('413 da el mismo motivo de tamaño que validarPdf, venga en status o en statusCode', () => {
    expect(mensajeDeErrorNormativa({ status: 413 })).toBe(MOTIVO_TAMANIO)
    expect(mensajeDeErrorNormativa({ status: '413' })).toBe(MOTIVO_TAMANIO)
    expect(mensajeDeErrorNormativa({ statusCode: '413' })).toBe(MOTIVO_TAMANIO)
    expect(mensajeDeErrorNormativa({ statusCode: 413 })).toBe(MOTIVO_TAMANIO)
  })

  it('415 da el mismo motivo de formato que validarPdf, venga en status o en statusCode', () => {
    expect(mensajeDeErrorNormativa({ status: 415 })).toBe(MOTIVO_FORMATO)
    expect(mensajeDeErrorNormativa({ status: '415' })).toBe(MOTIVO_FORMATO)
    expect(mensajeDeErrorNormativa({ statusCode: '415' })).toBe(MOTIVO_FORMATO)
    expect(mensajeDeErrorNormativa({ statusCode: 415 })).toBe(MOTIVO_FORMATO)
  })

  it('con la forma real de storage-js, status es el HTTP (400) y statusCode el rechazo', () => {
    expect(mensajeDeErrorNormativa({ name: 'StorageApiError', status: 400, statusCode: '413', code: 'EntityTooLarge' })).toBe(MOTIVO_TAMANIO)
    expect(mensajeDeErrorNormativa({ name: 'StorageApiError', status: 400, statusCode: '415', code: 'InvalidMimeType' })).toBe(MOTIVO_FORMATO)
  })

  it('cualquier otro error devuelve un mensaje genérico', () => {
    for (const error of [
      new Error('sin red'),
      { status: 500, statusCode: '500' },
      { code: '42501', message: 'rls' },
      { status: 400, statusCode: '404' },
      null,
      undefined,
      'texto',
    ]) {
      const mensaje = mensajeDeErrorNormativa(error)
      expect(mensaje.length).toBeGreaterThan(0)
      expect(mensaje).not.toMatch(/número|año|tamaño|formato/i)
    }
  })
})
