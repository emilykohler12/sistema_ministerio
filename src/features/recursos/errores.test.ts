import { describe, expect, it } from 'vitest'
import { validarArchivo } from './archivos'
import { esRechazoDelServidor, mensajeDeErrorRecurso } from './errores'

/*
 * Contrato de errores.ts (puro):
 *   mensajeDeErrorRecurso(error: unknown): string
 * Forma del error de Storage (StorageApiError de storage-js): { status: 413, statusCode: '413', message }.
 * Se acepta `status` (número o texto) o `statusCode` (texto o número).
 *   413 -> motivo de tamaño (menciona "tamaño"); 415 -> motivo de formato (menciona "formato");
 *   cualquier otra cosa -> mensaje genérico que no menciona ni tamaño ni formato.
 */

describe('mensajeDeErrorRecurso', () => {
  it('413 informa que el archivo supera el tamaño máximo', () => {
    expect(mensajeDeErrorRecurso({ status: 413, statusCode: '413', message: 'The object exceeded the maximum allowed size' })).toMatch(/tamaño/i)
  })

  it('415 informa que el formato no está admitido', () => {
    expect(mensajeDeErrorRecurso({ status: 415, statusCode: '415', message: 'mime type not supported' })).toMatch(/formato/i)
  })

  it('acepta el código en status o en statusCode, como número o como texto', () => {
    expect(mensajeDeErrorRecurso({ status: 413 })).toMatch(/tamaño/i)
    expect(mensajeDeErrorRecurso({ status: '413' })).toMatch(/tamaño/i)
    expect(mensajeDeErrorRecurso({ statusCode: '413' })).toMatch(/tamaño/i)
    expect(mensajeDeErrorRecurso({ statusCode: 413 })).toMatch(/tamaño/i)
    expect(mensajeDeErrorRecurso({ status: 415 })).toMatch(/formato/i)
    expect(mensajeDeErrorRecurso({ statusCode: '415' })).toMatch(/formato/i)
  })

  it('con la forma real de storage-js, status es el HTTP (400) y statusCode el código del rechazo', () => {
    expect(mensajeDeErrorRecurso({ name: 'StorageApiError', status: 400, statusCode: '413', code: 'EntityTooLarge' })).toMatch(/tamaño/i)
    expect(mensajeDeErrorRecurso({ name: 'StorageApiError', status: 400, statusCode: '415', code: 'InvalidMimeType' })).toMatch(/formato/i)
    expect(mensajeDeErrorRecurso({ status: 400, statusCode: '404' })).not.toMatch(/tamaño|formato/i)
  })

  it('el motivo de 413 es el mismo que da validarArchivo antes de subir (criterio 1)', () => {
    const grande = new File(['x'], 'video.mp4', { type: 'video/mp4' })
    Object.defineProperty(grande, 'size', { value: 52428801 })
    expect(mensajeDeErrorRecurso({ status: 413, statusCode: '413' })).toBe(validarArchivo(grande))
  })

  it('cualquier otro error devuelve un mensaje genérico, sin hablar de tamaño ni de formato', () => {
    for (const error of [
      new Error('sin red'),
      { status: 500, statusCode: '500' },
      { code: '42501', message: 'rls' },
      null,
      undefined,
      'texto',
    ]) {
      const mensaje = mensajeDeErrorRecurso(error)
      expect(mensaje.length).toBeGreaterThan(0)
      expect(mensaje).not.toMatch(/tamaño|formato/i)
    }
  })
})

/*
 * esRechazoDelServidor(error: unknown): boolean — true si el servidor respondió y rechazó la escritura (hay `code` no vacío:
 * SQLSTATE o PGRST…). Un corte de red llega con `code: ''` y `status: 0`: ahí la escritura pudo haberse confirmado.
 */
describe('esRechazoDelServidor', () => {
  it('es verdadero cuando el error trae un code no vacío', () => {
    expect(esRechazoDelServidor({ code: '42501', message: 'rls' })).toBe(true)
    expect(esRechazoDelServidor({ code: '23514' })).toBe(true)
    expect(esRechazoDelServidor({ code: 'PGRST116' })).toBe(true)
  })

  it('es falso con un corte de red de postgrest-js (code vacío, status 0)', () => {
    expect(esRechazoDelServidor({ message: 'TypeError: fetch failed', code: '', status: 0 })).toBe(false)
  })

  it('es falso sin code o con algo que no es un error del servidor', () => {
    expect(esRechazoDelServidor(new Error('sin red'))).toBe(false)
    expect(esRechazoDelServidor({ message: 'x' })).toBe(false)
    expect(esRechazoDelServidor({ code: 42501 })).toBe(false)
    expect(esRechazoDelServidor(null)).toBe(false)
    expect(esRechazoDelServidor(undefined)).toBe(false)
    expect(esRechazoDelServidor('texto')).toBe(false)
  })
})
