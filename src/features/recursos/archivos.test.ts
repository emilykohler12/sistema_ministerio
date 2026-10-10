import { describe, expect, it } from 'vitest'
import {
  FORMATOS,
  MIME_POR_TIPO,
  TAMANIO_MAXIMO,
  formatearTamanio,
  formatoDeArchivo,
  idDeYoutube,
  nombreSinExtension,
  rutaNueva,
  validarArchivo,
} from './archivos'

/*
 * Contrato de archivos.ts (puro, sin supabase):
 *   FORMATOS: Record<string, { tipo: TipoRecurso; mime: string }>   // clave = extensión en minúsculas, sin punto
 *   MIME_POR_TIPO: tipo -> mime (string) o lista de mimes (string[]) por cada tipo que no sea ENLACE.
 *     Aplanado, es exactamente el conjunto de allowed_mime_types del bucket `talleres` (el pgTAP lo fija).
 *   TAMANIO_MAXIMO: 52_428_800 (50 MiB)
 *   formatoDeArchivo(file: File): { tipo, mime } | null     // por extensión del nombre, ignora file.type
 *   validarArchivo(file: File): string | null               // motivo de rechazo, o null si se puede subir
 *   rutaNueva(tallerId: number, ext: string): string        // `<tallerId>/<uuid>.<ext>`; ext sin punto
 *   nombreSinExtension(nombre: string): string
 *   idDeYoutube(url: string): string | null                 // id de 11 caracteres, o null si no es un video de YouTube
 *   formatearTamanio(bytes: number): string                 // base 1024, unidades B/KB/MB/GB, como mucho un decimal,
 *                                                           // coma decimal (es-AR): 0 -> "0 B", 1536 -> "1,5 KB", 52428800 -> "50 MB"
 */

const MIME_DEL_BUCKET = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

function archivo(nombre: string, type = '', size?: number) {
  const f = new File(['contenido'], nombre, { type })
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('TAMANIO_MAXIMO', () => {
  it('es 50 MiB: 52 428 800 bytes', () => {
    expect(TAMANIO_MAXIMO).toBe(52428800)
  })
})

describe('FORMATOS', () => {
  it('cubre pdf, pptx, docx, jpg, jpeg, png, webp y mp4, cada uno con su tipo y su MIME canónico', () => {
    expect(FORMATOS).toEqual({
      pdf: { tipo: 'PDF', mime: 'application/pdf' },
      pptx: { tipo: 'PPTX', mime: MIME_PPTX },
      docx: { tipo: 'DOCX', mime: MIME_DOCX },
      jpg: { tipo: 'IMAGEN', mime: 'image/jpeg' },
      jpeg: { tipo: 'IMAGEN', mime: 'image/jpeg' },
      png: { tipo: 'IMAGEN', mime: 'image/png' },
      webp: { tipo: 'IMAGEN', mime: 'image/webp' },
      mp4: { tipo: 'VIDEO', mime: 'video/mp4' },
    })
  })
})

describe('MIME_POR_TIPO', () => {
  it('coincide con los 7 MIME de allowed_mime_types del bucket talleres', () => {
    const mimes = Object.values(MIME_POR_TIPO).flat()
    expect([...mimes].sort()).toEqual([...MIME_DEL_BUCKET].sort())
  })

  it('sale de la misma tabla que FORMATOS: todo MIME de FORMATOS está en MIME_POR_TIPO', () => {
    const mimes = new Set(Object.values(MIME_POR_TIPO).flat())
    for (const { mime } of Object.values(FORMATOS)) expect(mimes.has(mime)).toBe(true)
  })
})

describe('formatoDeArchivo', () => {
  it('resuelve el tipo y el MIME por la extensión', () => {
    expect(formatoDeArchivo(archivo('guia.pdf'))).toEqual({ tipo: 'PDF', mime: 'application/pdf' })
    expect(formatoDeArchivo(archivo('clase.pptx'))).toEqual({ tipo: 'PPTX', mime: MIME_PPTX })
    expect(formatoDeArchivo(archivo('foto.jpg'))).toEqual({ tipo: 'IMAGEN', mime: 'image/jpeg' })
    expect(formatoDeArchivo(archivo('foto.jpeg'))).toEqual({ tipo: 'IMAGEN', mime: 'image/jpeg' })
    expect(formatoDeArchivo(archivo('clip.mp4'))).toEqual({ tipo: 'VIDEO', mime: 'video/mp4' })
  })

  it('no depende de file.type: un .docx con type vacío es DOCX con el MIME canónico', () => {
    expect(formatoDeArchivo(archivo('planilla.docx', ''))).toEqual({ tipo: 'DOCX', mime: MIME_DOCX })
  })

  it('ignora un file.type que contradice la extensión', () => {
    expect(formatoDeArchivo(archivo('guia.pdf', 'application/octet-stream'))).toEqual({
      tipo: 'PDF',
      mime: 'application/pdf',
    })
    expect(formatoDeArchivo(archivo('malo.exe', 'application/pdf'))).toBeNull()
  })

  it('la extensión no distingue mayúsculas', () => {
    expect(formatoDeArchivo(archivo('GUIA.PDF'))?.tipo).toBe('PDF')
    expect(formatoDeArchivo(archivo('Foto.JpG'))?.tipo).toBe('IMAGEN')
  })

  it('usa la última extensión de un nombre con varios puntos', () => {
    expect(formatoDeArchivo(archivo('informe.v2.final.docx'))?.tipo).toBe('DOCX')
    expect(formatoDeArchivo(archivo('informe.pdf.exe'))).toBeNull()
  })

  it('devuelve null sin extensión o con una extensión no admitida', () => {
    expect(formatoDeArchivo(archivo('README'))).toBeNull()
    expect(formatoDeArchivo(archivo('terminado.'))).toBeNull()
    expect(formatoDeArchivo(archivo('instalador.exe'))).toBeNull()
    expect(formatoDeArchivo(archivo('datos.xlsx'))).toBeNull()
    expect(formatoDeArchivo(archivo('viejo.doc'))).toBeNull()
  })
})

describe('validarArchivo', () => {
  it('devuelve null para un archivo admitido de tamaño normal', () => {
    expect(validarArchivo(archivo('guia.pdf', 'application/pdf', 1000))).toBeNull()
  })

  it('acepta un .docx con type vacío', () => {
    expect(validarArchivo(archivo('planilla.docx', '', 1000))).toBeNull()
  })

  it('rechaza un formato no admitido con un motivo que menciona el formato', () => {
    const motivo = validarArchivo(archivo('instalador.exe', 'application/x-msdownload', 1000))
    expect(motivo).toEqual(expect.any(String))
    expect(motivo).toMatch(/formato/i)
  })

  it('rechaza un archivo sin extensión', () => {
    expect(validarArchivo(archivo('README', '', 10))).toMatch(/formato/i)
  })

  it('rechaza un archivo de más de 52 428 800 bytes con un motivo que menciona el tamaño', () => {
    const motivo = validarArchivo(archivo('video.mp4', 'video/mp4', 52428801))
    expect(motivo).toEqual(expect.any(String))
    expect(motivo).toMatch(/tamaño/i)
  })

  it('acepta un archivo de exactamente 52 428 800 bytes (el tope es inclusivo)', () => {
    expect(validarArchivo(archivo('video.mp4', 'video/mp4', 52428800))).toBeNull()
  })
})

describe('rutaNueva', () => {
  it('tiene la forma <tallerId>/<uuid>.<ext>', () => {
    expect(rutaNueva(12, 'pdf')).toMatch(
      /^12\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
    )
  })

  it('cada llamada genera una ruta distinta', () => {
    expect(rutaNueva(12, 'pdf')).not.toBe(rutaNueva(12, 'pdf'))
  })

  it('el prefijo es el id del taller dado (lo exige el CHECK de la base)', () => {
    expect(rutaNueva(7, 'mp4').startsWith('7/')).toBe(true)
    expect(rutaNueva(7, 'mp4').endsWith('.mp4')).toBe(true)
  })
})

describe('nombreSinExtension', () => {
  it('quita la extensión', () => {
    expect(nombreSinExtension('Guía de huerta.pdf')).toBe('Guía de huerta')
  })

  it('quita solo la última extensión', () => {
    expect(nombreSinExtension('informe.v2.final.docx')).toBe('informe.v2.final')
  })

  it('deja igual un nombre sin extensión', () => {
    expect(nombreSinExtension('README')).toBe('README')
  })
})

describe('idDeYoutube', () => {
  const ID = 'dQw4w9WgXcQ'

  it('extrae el id de un enlace watch', () => {
    expect(idDeYoutube(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(idDeYoutube(`https://youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(idDeYoutube(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('extrae el id de un enlace corto youtu.be', () => {
    expect(idDeYoutube(`https://youtu.be/${ID}`)).toBe(ID)
  })

  it('extrae el id de shorts y de embed', () => {
    expect(idDeYoutube(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
    expect(idDeYoutube(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
  })

  it('ignora los parámetros extra', () => {
    expect(idDeYoutube(`https://www.youtube.com/watch?v=${ID}&list=PL123&t=30s`)).toBe(ID)
    expect(idDeYoutube(`https://www.youtube.com/watch?feature=share&v=${ID}`)).toBe(ID)
    expect(idDeYoutube(`https://youtu.be/${ID}?t=10`)).toBe(ID)
    expect(idDeYoutube(`https://www.youtube.com/shorts/${ID}?feature=share`)).toBe(ID)
  })

  it('devuelve null si no es un video de YouTube', () => {
    expect(idDeYoutube('https://vimeo.com/123456789')).toBeNull()
    expect(idDeYoutube('https://example.com/informe.pdf')).toBeNull()
    expect(idDeYoutube(`https://example.com/watch?v=${ID}`)).toBeNull()
    expect(idDeYoutube(`https://youtube.com.malo.example/watch?v=${ID}`)).toBeNull()
    expect(idDeYoutube(`https://notyoutube.com/watch?v=${ID}`)).toBeNull()
  })

  it('devuelve null si es YouTube pero no apunta a un video', () => {
    expect(idDeYoutube('https://www.youtube.com/')).toBeNull()
    expect(idDeYoutube('https://www.youtube.com/watch')).toBeNull()
    expect(idDeYoutube('https://www.youtube.com/@canal')).toBeNull()
    expect(idDeYoutube('https://www.youtube.com/watch?v=corto')).toBeNull()
    expect(idDeYoutube('https://www.youtube.com/watch?v="><script>alert(1)</script>')).toBeNull()
  })

  it('devuelve null si lo que recibe no es una URL', () => {
    expect(idDeYoutube('')).toBeNull()
    expect(idDeYoutube('no es una url')).toBeNull()
  })
})

describe('formatearTamanio', () => {
  it('muestra bytes por debajo de 1 KB', () => {
    expect(formatearTamanio(0)).toBe('0 B')
    expect(formatearTamanio(512)).toBe('512 B')
    expect(formatearTamanio(1023)).toBe('1023 B')
  })

  it('usa base 1024 y un decimal con coma, sin ceros sobrantes', () => {
    expect(formatearTamanio(1024)).toBe('1 KB')
    expect(formatearTamanio(1536)).toBe('1,5 KB')
    expect(formatearTamanio(1048576)).toBe('1 MB')
    expect(formatearTamanio(2.5 * 1048576)).toBe('2,5 MB')
    expect(formatearTamanio(52428800)).toBe('50 MB')
    expect(formatearTamanio(1073741824)).toBe('1 GB')
  })
})
