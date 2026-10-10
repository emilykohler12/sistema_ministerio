import { supabase } from '@/shared/lib/supabase'

/**
 * Sube un objeto nuevo (nunca `upsert`: cada subida usa una ruta nueva). storage-js ignora `contentType` cuando el
 * cuerpo es un `File`, así que el MIME canónico viaja en un `File` nuevo; el bucket valida contra ese tipo.
 */
export async function subirArchivo(bucket: string, ruta: string, file: File, mime: string): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(ruta, new File([file], file.name, { type: mime }), { upsert: false })
  if (error) throw error
}

/**
 * `remove()` devuelve `data: []` sin error cuando no borró nada (la RLS lo oculta o no existe): se trata como falla,
 * para que el aviso de huérfano de las secuencias no se pierda.
 */
export async function borrarArchivo(bucket: string, ruta: string): Promise<void> {
  const { data, error } = await supabase.storage.from(bucket).remove([ruta])
  if (error) throw error
  if (data.length === 0) throw new Error(`Storage no borró el objeto ${ruta}`)
}

/** Borra un archivo como compensación o limpieza: si falla, queda un huérfano y solo se avisa. */
export async function borrarOAvisar(
  borrar: (ruta: string) => Promise<void>,
  ruta: string,
  contexto: string,
): Promise<void> {
  try {
    await borrar(ruta)
  } catch (error) {
    console.warn(`Archivo huérfano en Storage (${contexto}): ${ruta}`, error)
  }
}

/**
 * `true` si el servidor respondió y rechazó la escritura (hay `code`: SQLSTATE o PGRST…). Un corte de red llega con
 * `code: ''` y `status: 0`: la escritura pudo haberse confirmado, así que no se debe compensar borrando el archivo.
 */
function esRechazoDelServidor(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code } = error as { code?: unknown }
  return typeof code === 'string' && code !== ''
}

/**
 * Compensa una escritura fallida borrando el archivo recién subido, pero solo si el servidor la rechazó. Ante una falla
 * ambigua (corte de red: la escritura pudo confirmarse) borrar dejaría una fila apuntando a la nada; es preferible un
 * huérfano, el único modo de falla aceptado. El error original lo propaga quien llama.
 */
export async function compensar(
  borrar: (ruta: string) => Promise<void>,
  ruta: string,
  error: unknown,
  contexto: string,
): Promise<void> {
  if (esRechazoDelServidor(error)) {
    await borrarOAvisar(borrar, ruta, contexto)
  } else {
    console.warn(`Posible archivo huérfano en Storage (${contexto}, respuesta incierta): ${ruta}`, error)
  }
}
