import { borrarOAvisar as borrarOAvisarEn, compensar as compensarEn } from '@/shared/lib/storage'
import { rutaNueva } from './archivos'
import { borrarArchivo, eliminarFilaNormativa, guardarNormativa, subirArchivo } from './consultas'
import type { DatosNormativa } from './types'

/*
 * Base y Storage no comparten transacción. Invariante: ninguna operación deja una fila apuntando a un archivo que no
 * existe. Lo sostiene el orden: el archivo nuevo se sube antes de escribir la fila, y el viejo se borra después.
 * El único modo de falla aceptado es un archivo huérfano en Storage (sin fila), que se registra con console.warn.
 */

const borrarOAvisar = (ruta: string, contexto: string) => borrarOAvisarEn(borrarArchivo, ruta, contexto)
const compensar = (ruta: string, error: unknown, contexto: string) => compensarEn(borrarArchivo, ruta, error, contexto)

function argsDe(datos: DatosNormativa) {
  return {
    p_titulo: datos.titulo,
    p_descripcion: datos.descripcion,
    p_numero: datos.numero,
    p_anio: datos.anio,
    p_etiquetas: datos.etiquetas,
  }
}

/** Sube el PDF y recién entonces guarda la fila; si el servidor rechaza el guardado, borra el archivo y propaga el error. */
export async function altaNormativa(datos: DatosNormativa, file: File): Promise<number> {
  const ruta = rutaNueva()
  await subirArchivo(ruta, file)
  try {
    const { id } = await guardarNormativa({ ...argsDe(datos), p_ruta_archivo: ruta })
    return id
  } catch (error) {
    await compensar(ruta, error, 'el alta falló')
    throw error
  }
}

/**
 * Sin archivo, la ruta nula conserva el de la base. Con archivo: sube el nuevo, guarda la fila y recién entonces borra
 * la ruta anterior que devuelve la RPC (leída dentro de la transacción, no la de la caché); si es `null`, no borra nada.
 */
export async function editarNormativa(id: number, datos: DatosNormativa, file?: File): Promise<number> {
  const ruta = file ? rutaNueva() : null
  if (file && ruta) await subirArchivo(ruta, file)
  let resultado
  try {
    resultado = await guardarNormativa({ ...argsDe(datos), p_id: id, p_ruta_archivo: ruta })
  } catch (error) {
    if (ruta) await compensar(ruta, error, 'la edición falló')
    throw error
  }
  if (resultado.ruta_anterior !== null) await borrarOAvisar(resultado.ruta_anterior, 'reemplazo')
  return resultado.id
}

/**
 * Borra la fila y después el archivo. La ruta es la que tenía la fila en la base (la devuelve el `delete`), no la de la
 * caché. Si falla el borrado del archivo la normativa ya no existe, así que es éxito.
 */
export async function eliminarNormativa(id: number): Promise<void> {
  const ruta = await eliminarFilaNormativa(id)
  await borrarOAvisar(ruta, 'eliminación')
}
