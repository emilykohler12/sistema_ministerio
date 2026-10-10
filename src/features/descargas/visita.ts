import { esquemaDescarga } from './esquema'
import type { DatosDescarga } from './types'

const CLAVE_FORMULARIO = 'descarga-formulario'
const MARCA_TALLER = 'descarga-taller-registrado:'

// Los talleres registrados en esta visita. Vive en el módulo para que la marca valga aunque sessionStorage falle
// (modo privado, cuota): sin ella, "Reintentar" tras una firma fallida registraría la descarga otra vez.
const registrados = new Set<number>()

/** Guarda el formulario durante la visita (`sessionStorage`). Si el navegador lo impide, no se recuerda y nada falla. */
export function recordarFormulario(datos: DatosDescarga): void {
  try {
    sessionStorage.setItem(CLAVE_FORMULARIO, JSON.stringify(datos))
  } catch {
    // Sin sessionStorage: el formulario no se recuerda entre talleres.
  }
}

/** El formulario recordado, validado con el esquema; `null` si no hay, no es JSON o ya no pasa la validación. */
export function formularioRecordado(): DatosDescarga | null {
  try {
    const guardado = sessionStorage.getItem(CLAVE_FORMULARIO)
    if (guardado === null) return null
    const resultado = esquemaDescarga.safeParse(JSON.parse(guardado))
    return resultado.success ? resultado.data : null
  } catch {
    return null
  }
}

/** Marca el taller como registrado en esta visita: un taller registrado no se vuelve a contar. */
export function marcarTallerRegistrado(tallerId: number): void {
  registrados.add(tallerId)
  try {
    sessionStorage.setItem(MARCA_TALLER + tallerId, '1')
  } catch {
    // Sin sessionStorage: la marca vale solo en memoria.
  }
}

export function tallerRegistrado(tallerId: number): boolean {
  if (registrados.has(tallerId)) return true
  try {
    return sessionStorage.getItem(MARCA_TALLER + tallerId) !== null
  } catch {
    return false
  }
}
