import { describe, expect, it } from 'vitest'
import { MOTIVO_FORMATO, MOTIVO_TAMANIO } from './archivos'
import { MENSAJE_LOGO_CAMBIADO, mensajeDeErrorLogo } from './errores'

/*
 * Contrato (criterios 2 y 3). src/features/configuracion/errores.ts, puro:
 *   mensajeDeErrorLogo(error: unknown): string
 *     413 (status o statusCode de Storage) -> MOTIVO_TAMANIO; 415 -> MOTIVO_FORMATO (los mismos que da validarLogo);
 *     PGRST116 (otro admin cambió el logo mientras) -> MENSAJE_LOGO_CAMBIADO; cualquier otro -> mensaje genérico.
 */
describe('mensajeDeErrorLogo', () => {
  it('413 en statusCode -> el mismo motivo de tamaño que validarLogo', () => {
    expect(mensajeDeErrorLogo({ statusCode: '413', message: 'too large' })).toBe(MOTIVO_TAMANIO)
  })

  it('413 en status (número) -> motivo de tamaño', () => {
    expect(mensajeDeErrorLogo({ status: 413 })).toBe(MOTIVO_TAMANIO)
  })

  it('415 -> el mismo motivo de formato que validarLogo', () => {
    expect(mensajeDeErrorLogo({ status: 400, statusCode: '415' })).toBe(MOTIVO_FORMATO)
  })

  it('PGRST116 -> avisa que el logo cambió mientras tanto', () => {
    expect(mensajeDeErrorLogo({ code: 'PGRST116', message: '0 rows' })).toBe(MENSAJE_LOGO_CAMBIADO)
    expect(MENSAJE_LOGO_CAMBIADO).toMatch(/cambió/)
  })

  it('un error cualquiera da un mensaje genérico distinto de los demás', () => {
    const generico = mensajeDeErrorLogo(new Error('boom'))
    expect(generico).toMatch(/\S/)
    expect([MOTIVO_TAMANIO, MOTIVO_FORMATO, MENSAJE_LOGO_CAMBIADO]).not.toContain(generico)
  })

  it('valores que no son objetos dan el mensaje genérico sin lanzar', () => {
    const generico = mensajeDeErrorLogo(new Error('boom'))
    expect(mensajeDeErrorLogo(null)).toBe(generico)
    expect(mensajeDeErrorLogo('texto')).toBe(generico)
    expect(mensajeDeErrorLogo(undefined)).toBe(generico)
  })
})
