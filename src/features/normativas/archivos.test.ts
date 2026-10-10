import { describe, expect, it } from 'vitest'
import { MOTIVO_FORMATO, MOTIVO_TAMANIO, TAMANIO_MAXIMO, rutaNueva, validarPdf } from './archivos'

/*
 * Contrato de src/features/normativas/archivos.ts (puro, criterio 2):
 *   TAMANIO_MAXIMO = 20_971_520     // 20 MiB: lo hace cumplir el bucket `normativas` (file_size_limit)
 *   MOTIVO_TAMANIO: string          // menciona "20 MB"
 *   MOTIVO_FORMATO: string          // menciona "PDF"
 *   validarPdf(file: File): string | null    // motivo por el que no se puede subir, o null si se puede
 *       formato: se decide por la extensión .pdf (sin importar mayúsculas), no por file.type
 *       tamaño: file.size > TAMANIO_MAXIMO se rechaza; exactamente TAMANIO_MAXIMO se acepta
 *       si fallan las dos cosas, gana el motivo de formato
 *   rutaNueva(): string             // `<uuid>.pdf` (el id de la fila no existe todavía al subir); cumple /^[0-9a-f-]{36}\.pdf$/
 */

function archivo(nombre: string, tamanio = 10, tipo = ''): File {
  const file = new File(['x'], nombre, { type: tipo })
  Object.defineProperty(file, 'size', { value: tamanio })
  return file
}

describe('TAMANIO_MAXIMO', () => {
  it('son 20 MiB', () => {
    expect(TAMANIO_MAXIMO).toBe(20_971_520)
  })
})

describe('validarPdf', () => {
  it('acepta un PDF chico', () => {
    expect(validarPdf(archivo('resolucion.pdf', 1000, 'application/pdf'))).toBeNull()
  })

  it('acepta la extensión sin importar mayúsculas', () => {
    expect(validarPdf(archivo('RESOLUCION.PDF'))).toBeNull()
    expect(validarPdf(archivo('decreto.Pdf'))).toBeNull()
  })

  it('decide por la extensión y no por file.type (type vacío o equivocado)', () => {
    expect(validarPdf(archivo('a.pdf', 10, ''))).toBeNull()
    expect(validarPdf(archivo('a.pdf', 10, 'text/plain'))).toBeNull()
    expect(validarPdf(archivo('a.docx', 10, 'application/pdf'))).toBe(MOTIVO_FORMATO)
  })

  it('rechaza otros formatos y nombres sin extensión', () => {
    expect(validarPdf(archivo('a.docx'))).toBe(MOTIVO_FORMATO)
    expect(validarPdf(archivo('a.png'))).toBe(MOTIVO_FORMATO)
    expect(validarPdf(archivo('a.pdf.exe'))).toBe(MOTIVO_FORMATO)
    expect(validarPdf(archivo('pdf'))).toBe(MOTIVO_FORMATO)
    expect(validarPdf(archivo('.pdf'))).toBe(MOTIVO_FORMATO)
  })

  it('acepta exactamente 20 MiB y rechaza un byte más', () => {
    expect(validarPdf(archivo('a.pdf', 20_971_520))).toBeNull()
    expect(validarPdf(archivo('a.pdf', 20_971_521))).toBe(MOTIVO_TAMANIO)
  })

  it('si falla el formato y el tamaño, informa el formato', () => {
    expect(validarPdf(archivo('a.docx', 20_971_521))).toBe(MOTIVO_FORMATO)
  })

  it('los motivos hablan de PDF y de 20 MB', () => {
    expect(MOTIVO_FORMATO).toMatch(/PDF/)
    expect(MOTIVO_TAMANIO).toMatch(/20 MB/)
  })
})

describe('rutaNueva', () => {
  it('es un uuid con extensión .pdf, como exige el CHECK de la base', () => {
    expect(rutaNueva()).toMatch(/^[0-9a-f-]{36}\.pdf$/)
  })

  it('no repite rutas', () => {
    expect(rutaNueva()).not.toBe(rutaNueva())
  })
})
