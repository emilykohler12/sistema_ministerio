import { borrarOAvisar as borrarOAvisarEn, compensar as compensarEn } from '@/shared/lib/storage'
import { rutaNueva } from './archivos'
import { actualizarLogo, borrarLogo, subirLogo } from './consultas'
import type { Configuracion } from './types'

/*
 * Base y Storage no comparten transacción (0016). Invariante: la fila nunca apunta a un archivo que no existe. Lo
 * sostiene el orden: el archivo nuevo se sube antes de escribir la fila y el viejo se borra después. El único modo de
 * falla aceptado es un archivo huérfano en Storage, que se registra con console.warn.
 */

const borrarOAvisar = (ruta: string, contexto: string) => borrarOAvisarEn(borrarLogo, ruta, contexto)
const compensar = (ruta: string, error: unknown, contexto: string) => compensarEn(borrarLogo, ruta, error, contexto)

/**
 * Sube el logo, apunta la fila a él (condicionado a `anterior`) y recién entonces borra el anterior. Si el servidor
 * rechaza el UPDATE borra el archivo recién subido y propaga el error; si falla solo el borrado del anterior, el cambio
 * es un éxito con un huérfano.
 */
export async function cambiarLogo(file: File, anterior: string | null): Promise<Configuracion> {
  const ruta = rutaNueva(file)
  await subirLogo(ruta, file)
  let fila
  try {
    fila = await actualizarLogo(ruta, anterior)
  } catch (error) {
    await compensar(ruta, error, 'el cambio de logo falló')
    throw error
  }
  if (anterior !== null) await borrarOAvisar(anterior, 'reemplazo del logo')
  return fila
}

/** Pone la fila en NULL (condicionado a `anterior`) y después borra el archivo; si el borrado falla, ya está quitado. */
export async function quitarLogo(anterior: string): Promise<Configuracion> {
  const fila = await actualizarLogo(null, anterior)
  await borrarOAvisar(anterior, 'quitar el logo')
  return fila
}
