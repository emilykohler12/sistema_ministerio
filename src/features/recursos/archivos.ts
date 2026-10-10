import type { TipoRecurso } from './types'

/** 50 MiB. Lo hace cumplir el bucket `talleres` (`file_size_limit`); el cliente lo valida antes de subir. */
export const TAMANIO_MAXIMO = 52_428_800

export const MOTIVO_TAMANIO = 'El archivo supera el tamaño máximo de 50 MB.'
export const MOTIVO_FORMATO = 'Formato no admitido. Subí un PDF, PPTX, DOCX, imagen (JPG, PNG o WebP) o MP4.'

type Formato = { tipo: Exclude<TipoRecurso, 'ENLACE'>; mime: string }

/**
 * Única tabla de formatos: extensión (en minúsculas, sin punto) → tipo y MIME canónico. El tipo y el MIME salen de
 * la extensión y no de `file.type`, que en algunos equipos llega vacío (un .docx sin Office instalado).
 */
export const FORMATOS = {
  pdf: { tipo: 'PDF', mime: 'application/pdf' },
  pptx: { tipo: 'PPTX', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  docx: { tipo: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  jpg: { tipo: 'IMAGEN', mime: 'image/jpeg' },
  jpeg: { tipo: 'IMAGEN', mime: 'image/jpeg' },
  png: { tipo: 'IMAGEN', mime: 'image/png' },
  webp: { tipo: 'IMAGEN', mime: 'image/webp' },
  mp4: { tipo: 'VIDEO', mime: 'video/mp4' },
} as const satisfies Record<string, Formato>

/**
 * MIME admitidos por tipo. Aplanado es el conjunto de `allowed_mime_types` del bucket (el pgTAP lo fija):
 * si cambia `FORMATOS`, cambia la migración del bucket.
 */
export const MIME_POR_TIPO = Object.values(FORMATOS).reduce<Record<string, string[]>>((acc, { tipo, mime }) => {
  const lista = (acc[tipo] ??= [])
  if (!lista.includes(mime)) lista.push(mime)
  return acc
}, {})

/** Extensión en minúsculas, sin punto, o `null` si el nombre no tiene (un nombre que solo empieza con punto no cuenta). */
export function extensionDe(nombre: string): string | null {
  const i = nombre.lastIndexOf('.')
  if (i <= 0 || i === nombre.length - 1) return null
  return nombre.slice(i + 1).toLowerCase()
}

export function formatoDeArchivo(file: File): Formato | null {
  const ext = extensionDe(file.name)
  if (ext === null || !Object.hasOwn(FORMATOS, ext)) return null
  return FORMATOS[ext as keyof typeof FORMATOS]
}

/** Motivo por el que el archivo no se puede subir, o `null` si se puede. */
export function validarArchivo(file: File): string | null {
  if (formatoDeArchivo(file) === null) return MOTIVO_FORMATO
  if (file.size > TAMANIO_MAXIMO) return MOTIVO_TAMANIO
  return null
}

/** Ruta nueva en el bucket: el prefijo `<taller_id>/` lo exige un CHECK de la base; el uuid evita colisiones. */
export function rutaNueva(tallerId: number, ext: string): string {
  return `${tallerId}/${crypto.randomUUID()}.${ext}`
}

export function nombreSinExtension(nombre: string): string {
  return extensionDe(nombre) === null ? nombre : nombre.slice(0, nombre.lastIndexOf('.'))
}

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/
const HOSTS_YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])

/** Id de 11 caracteres de un video de YouTube (watch, youtu.be, shorts o embed), o `null`. */
export function idDeYoutube(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  let candidato: string | null = null
  if (u.hostname === 'youtu.be') {
    candidato = u.pathname.split('/')[1] ?? null
  } else if (HOSTS_YOUTUBE.has(u.hostname)) {
    const [, primero, segundo] = u.pathname.split('/')
    if (primero === 'watch') candidato = u.searchParams.get('v')
    else if (primero === 'shorts' || primero === 'embed') candidato = segundo ?? null
  }
  return candidato !== null && ID_YOUTUBE.test(candidato) ? candidato : null
}

const UNIDADES = ['B', 'KB', 'MB', 'GB']

/** Base 1024, como mucho un decimal y coma decimal (es-AR): 1536 → "1,5 KB". */
export function formatearTamanio(bytes: number): string {
  let valor = bytes
  let i = 0
  while (valor >= 1024 && i < UNIDADES.length - 1) {
    valor /= 1024
    i++
  }
  if (i === 0) return `${bytes} B`
  return `${String(Math.round(valor * 10) / 10).replace('.', ',')} ${UNIDADES[i]}`
}
