import { normalizar } from '@/shared/lib/texto'
import type { Establecimiento } from './types'

/** Módulo puro: sin imports de Supabase, para probarlo y usarlo sin cargar el cliente. */

/** Busca (contiene) en nombre o CUE, sin distinguir mayúsculas ni tildes. Conserva el orden y los inactivos. */
export function filtrarEstablecimientos(establecimientos: Establecimiento[], busqueda?: string): Establecimiento[] {
  const consulta = normalizar(busqueda?.trim() ?? '')
  if (consulta === '') return establecimientos
  return establecimientos.filter((e) => [e.nombre, e.cue ?? ''].some((texto) => normalizar(texto).includes(consulta)))
}
