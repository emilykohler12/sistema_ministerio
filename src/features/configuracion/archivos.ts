/** 2 MiB. Lo hace cumplir el bucket `logo` (`file_size_limit`); el cliente lo valida antes de subir. */
export const TAMANIO_MAXIMO = 2_097_152

export const MOTIVO_TAMANIO = 'La imagen supera el tamaño máximo de 2 MB.'
export const MOTIVO_FORMATO = 'Formato no admitido. Subí una imagen PNG, JPG o WebP.'

/**
 * Única tabla de formatos: extensión de entrada (en minúsculas, sin punto) → extensión guardada y MIME canónico.
 * `jpeg` se guarda siempre como `.jpg`. El MIME sale de la extensión y no de `file.type`, que puede llegar vacío.
 * Aplanados, los MIME son los `allowed_mime_types` del bucket `logo` y las extensiones guardadas, las del CHECK.
 */
const FORMATOS = {
  png: { ext: 'png', mime: 'image/png' },
  jpg: { ext: 'jpg', mime: 'image/jpeg' },
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  webp: { ext: 'webp', mime: 'image/webp' },
} as const

function formatoDe(file: File) {
  const i = file.name.lastIndexOf('.')
  if (i <= 0 || i === file.name.length - 1) return null
  const entrada = file.name.slice(i + 1).toLowerCase()
  return Object.hasOwn(FORMATOS, entrada) ? FORMATOS[entrada as keyof typeof FORMATOS] : null
}

/** Motivo por el que el archivo no se puede subir, o `null` si se puede. El formato se decide por la extensión. */
export function validarLogo(file: File): string | null {
  if (formatoDe(file) === null) return MOTIVO_FORMATO
  if (file.size > TAMANIO_MAXIMO) return MOTIVO_TAMANIO
  return null
}

/** MIME canónico según la extensión (`image/png`, `image/jpeg` o `image/webp`). Solo para archivos ya validados. */
export function mimeDeLogo(file: File): string {
  const formato = formatoDe(file)
  if (formato === null) throw new Error(`Formato de logo no admitido: ${file.name}`)
  return formato.mime
}

/** Ruta nueva en el bucket: `<uuid>.<png|jpg|webp>`, el formato que exige el CHECK de `configuracion.logo_ruta`. */
export function rutaNueva(file: File): string {
  const formato = formatoDe(file)
  if (formato === null) throw new Error(`Formato de logo no admitido: ${file.name}`)
  return `${crypto.randomUUID()}.${formato.ext}`
}
