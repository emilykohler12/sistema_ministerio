/** 20 MiB. Lo hace cumplir el bucket `normativas` (`file_size_limit`); el cliente lo valida antes de subir. */
export const TAMANIO_MAXIMO = 20_971_520

export const MOTIVO_TAMANIO = 'El archivo supera el tamaño máximo de 20 MB.'
export const MOTIVO_FORMATO = 'Formato no admitido. Subí un archivo PDF.'

/** Motivo por el que el archivo no se puede subir, o `null` si se puede. El formato se decide por la extensión, no por `file.type`. */
export function validarPdf(file: File): string | null {
  const i = file.name.lastIndexOf('.')
  const esPdf = i > 0 && file.name.slice(i + 1).toLowerCase() === 'pdf'
  if (!esPdf) return MOTIVO_FORMATO
  if (file.size > TAMANIO_MAXIMO) return MOTIVO_TAMANIO
  return null
}

/** Ruta nueva en el bucket: el id de la fila no existe todavía al subir, así que es solo un uuid (lo exige un CHECK de la base). */
export function rutaNueva(): string {
  return `${crypto.randomUUID()}.pdf`
}
