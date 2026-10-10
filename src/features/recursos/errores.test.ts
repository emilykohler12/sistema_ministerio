import { describe, expect, it } from 'vitest'
import { validarArchivo } from './archivos'
import { mensajeDeErrorRecurso } from './errores'

/*
 * Contrato de errores.ts (puro):
 *   mensajeDeErrorRecurso(error: unknown): string
 * Forma del error de Storage (StorageApiError de storage-js): { status: 413, statusCode: '413', message }.
 * Se acepta `status` (número o texto) o `statusCode` (texto o número).
 *   413 -> motivo de tamaño (menciona "tamaño"); 415 -> motivo de formato (menciona "formato");
 *   cualquier otra cosa -> mensaje genérico que no menciona ni tamaño ni formato.
 * (esRechazoDelServidor se mudó, privado, a src/shared/lib/storage.ts; se prueba allí a través de `compensar`.)
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
