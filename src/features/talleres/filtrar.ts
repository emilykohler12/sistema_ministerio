import { normalizar } from '@/shared/lib/texto'
import type { Taller } from './types'

/** Módulo puro: sin imports de Supabase, para probarlo y usarlo sin cargar el cliente. */

export interface FiltrosTalleres {
  nivelId?: number
  destinatarioId?: number
  busqueda?: string
}

/** Combina nivel (vía la categoría), destinatario y búsqueda en nombre, descripción y etiquetas. */
export function filtrarTalleres(talleres: Taller[], filtros: FiltrosTalleres): Taller[] {
  const consulta = normalizar(filtros.busqueda?.trim() ?? '')
  return talleres.filter((t) => {
    if (filtros.nivelId !== undefined && t.categoria.nivel_id !== filtros.nivelId) return false
    if (filtros.destinatarioId !== undefined && !t.destinatario.some((d) => d.id === filtros.destinatarioId)) {
      return false
    }
    if (consulta === '') return true
    return [t.nombre, t.descripcion, ...t.etiqueta.map((e) => e.nombre)].some((texto) =>
      normalizar(texto).includes(consulta),
    )
  })
}
