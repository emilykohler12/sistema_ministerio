import { MOTIVO_FORMATO, extensionDe, formatoDeArchivo, nombreSinExtension, rutaNueva } from './archivos'
import { esRechazoDelServidor } from './errores'
import { actualizarRecurso, borrarArchivo, eliminarFilaRecurso, insertarRecurso, subirArchivo } from './consultas'
import type { Recurso } from './types'

/*
 * Base y Storage no comparten transacción. Invariante: ninguna operación deja una fila apuntando a un archivo que no
 * existe. Lo sostiene el orden: el archivo nuevo se sube antes de escribir la fila, y el viejo se borra después.
 * El único modo de falla aceptado es un archivo huérfano en Storage (sin fila), que se registra con console.warn.
 */

function datosDeArchivo(file: File) {
  const formato = formatoDeArchivo(file)
  const ext = extensionDe(file.name)
  if (!formato || !ext) throw new Error(MOTIVO_FORMATO)
  return { formato, ext }
}

/** Borra un archivo como compensación o limpieza: si falla, queda un huérfano y solo se avisa. */
async function borrarOAvisar(ruta: string, contexto: string) {
  try {
    await borrarArchivo(ruta)
  } catch (error) {
    console.warn(`Archivo huérfano en Storage (${contexto}): ${ruta}`, error)
  }
}

/**
 * Compensa una escritura fallida borrando el archivo recién subido, pero solo si el servidor la rechazó. Ante una falla
 * ambigua (corte de red: la escritura pudo confirmarse) borrar dejaría una fila apuntando a la nada; es preferible un
 * huérfano, el único modo de falla aceptado. El error original lo propaga quien llama.
 */
async function compensar(ruta: string, error: unknown, contexto: string) {
  if (esRechazoDelServidor(error)) {
    await borrarOAvisar(ruta, contexto)
  } else {
    console.warn(`Posible archivo huérfano en Storage (${contexto}, respuesta incierta): ${ruta}`, error)
  }
}

/** Sube el archivo y recién entonces inserta la fila; si el servidor rechaza el insert, borra el archivo y propaga el error. */
export async function altaArchivo(tallerId: number, file: File, orden: number): Promise<Recurso> {
  const { formato, ext } = datosDeArchivo(file)
  const ruta = rutaNueva(tallerId, ext)
  await subirArchivo(ruta, file, formato.mime)
  try {
    return await insertarRecurso({
      taller_id: tallerId,
      // La columna es varchar(200) y no puede quedar en blanco.
      nombre: nombreSinExtension(file.name).trim().slice(0, 200) || 'Archivo',
      tipo: formato.tipo,
      ruta_archivo: ruta,
      tamanio_bytes: file.size,
      orden,
    })
  } catch (error) {
    await compensar(ruta, error, 'el alta falló')
    throw error
  }
}

/** Sube el nuevo, actualiza la fila (conserva nombre, orden e id) y recién entonces borra el anterior. */
export async function reemplazarArchivo(recurso: Recurso, file: File): Promise<Recurso> {
  const anterior = recurso.ruta_archivo
  if (anterior === null) throw new Error('Un enlace no se reemplaza: se elimina y se crea otro.')
  const { formato, ext } = datosDeArchivo(file)
  const ruta = rutaNueva(recurso.taller_id, ext)
  await subirArchivo(ruta, file, formato.mime)
  let actualizado: Recurso
  try {
    actualizado = await actualizarRecurso(recurso.id, {
      ruta_archivo: ruta,
      tipo: formato.tipo,
      tamanio_bytes: file.size,
    })
  } catch (error) {
    await compensar(ruta, error, 'el reemplazo falló')
    throw error
  }
  await borrarOAvisar(anterior, 'reemplazo')
  return actualizado
}

/** Borra la fila y después el archivo: si falla el borrado del archivo el recurso ya no existe, así que es éxito. */
export async function eliminarRecurso(recurso: Recurso): Promise<void> {
  await eliminarFilaRecurso(recurso.id)
  if (recurso.ruta_archivo !== null) await borrarOAvisar(recurso.ruta_archivo, 'eliminación')
}
