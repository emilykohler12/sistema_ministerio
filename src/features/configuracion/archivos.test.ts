import { describe, expect, it } from 'vitest'
import { MOTIVO_FORMATO, MOTIVO_TAMANIO, TAMANIO_MAXIMO, mimeDeLogo, rutaNueva, validarLogo } from './archivos'

/*
 * Contrato (logo institucional, criterios 2, 3 y 9). src/features/configuracion/archivos.ts, puro:
 *   TAMANIO_MAXIMO = 2_097_152 (2 MiB), MOTIVO_TAMANIO, MOTIVO_FORMATO
 *   validarLogo(file): string | null   // motivo o null; el formato se decide por la extensión, no por file.type
 *   mimeDeLogo(file): string           // image/png | image/jpeg | image/webp, sale de la extensión
 *   rutaNueva(file): string            // <uuid>.<png|jpg|webp>; `jpeg` y `JPG` se guardan como `.jpg`
 */
const REGEX_RUTA = /^[0-9a-f-]{36}\.(png|jpg|webp)$/

/** File con el tamaño pedido sin reservar memoria de más: size se define aparte. */
function archivo(nombre: string, tamanio = 1000, tipo = '') {
  const file = new File(['x'], nombre, { type: tipo })
  Object.defineProperty(file, 'size', { value: tamanio })
  return file
}

describe('validarLogo', () => {
  it.each(['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp'])('acepta %s', (nombre) => {
    expect(validarLogo(archivo(nombre))).toBeNull()
  })

  it.each(['logo.PNG', 'logo.JpG', 'logo.JPEG', 'logo.WebP'])('acepta la extensión sin distinguir mayúsculas: %s', (nombre) => {
    expect(validarLogo(archivo(nombre))).toBeNull()
  })

  it.each(['logo.gif', 'logo.svg', 'logo.pdf', 'logo', 'logo.', '.png'])('rechaza %s con el motivo de formato', (nombre) => {
    expect(validarLogo(archivo(nombre))).toBe(MOTIVO_FORMATO)
  })

  it('decide por la extensión y no por file.type: un .gif que dice ser image/png se rechaza', () => {
    expect(validarLogo(archivo('logo.gif', 1000, 'image/png'))).toBe(MOTIVO_FORMATO)
  })

  it('decide por la extensión y no por file.type: un .png con tipo vacío se acepta', () => {
    expect(validarLogo(archivo('logo.png', 1000, ''))).toBeNull()
  })

  it('el tope es de 2 MiB', () => {
    expect(TAMANIO_MAXIMO).toBe(2_097_152)
  })

  it('un archivo justo en el tope pasa', () => {
    expect(validarLogo(archivo('logo.png', 2_097_152))).toBeNull()
  })

  it('un byte más que el tope se rechaza con el motivo de tamaño', () => {
    expect(validarLogo(archivo('logo.png', 2_097_153))).toBe(MOTIVO_TAMANIO)
  })

  it('los motivos son mensajes en español que nombran el límite y los formatos', () => {
    expect(MOTIVO_TAMANIO).toMatch(/2 MB/)
    expect(MOTIVO_FORMATO).toMatch(/PNG/)
    expect(MOTIVO_FORMATO).toMatch(/JPG/)
    expect(MOTIVO_FORMATO).toMatch(/WebP/)
  })
})

describe('mimeDeLogo', () => {
  it.each([
    ['logo.png', 'image/png'],
    ['logo.jpg', 'image/jpeg'],
    ['logo.jpeg', 'image/jpeg'],
    ['logo.JPEG', 'image/jpeg'],
    ['logo.webp', 'image/webp'],
  ])('%s -> %s', (nombre, mime) => {
    expect(mimeDeLogo(archivo(nombre))).toBe(mime)
  })

  it('sale de la extensión aunque file.type diga otra cosa', () => {
    expect(mimeDeLogo(archivo('logo.webp', 1000, 'application/octet-stream'))).toBe('image/webp')
  })
})

describe('rutaNueva', () => {
  it.each([
    ['logo.png', 'png'],
    ['logo.PNG', 'png'],
    ['logo.jpg', 'jpg'],
    ['logo.JPG', 'jpg'],
    ['logo.jpeg', 'jpg'],
    ['logo.JPEG', 'jpg'],
    ['logo.webp', 'webp'],
    ['logo.WEBP', 'webp'],
  ])('para %s es <uuid>.%s en minúscula', (nombre, ext) => {
    const ruta = rutaNueva(archivo(nombre))
    expect(ruta).toMatch(REGEX_RUTA)
    expect(ruta.endsWith(`.${ext}`)).toBe(true)
  })

  it('cada llamada devuelve un uuid distinto', () => {
    expect(rutaNueva(archivo('a.png'))).not.toBe(rutaNueva(archivo('a.png')))
  })
})
