import { useQuery } from '@tanstack/react-query'
import { obtenerEtiquetas } from '../consultas'

// Clave única: la invalidan las mutaciones de taller y de normativa, porque un guardado puede crear etiquetas nuevas.
export const CLAVE_ETIQUETAS = ['etiquetas'] as const

/** Nombres únicos de las etiquetas existentes, ordenados, para sugerir en los formularios. `[]` mientras carga o si falla. */
export function useEtiquetas(): string[] {
  const { data } = useQuery({
    queryKey: CLAVE_ETIQUETAS,
    queryFn: obtenerEtiquetas,
    select: (todas) =>
      Array.from(new Set(todas.map((e) => e.nombre))).sort((a, b) => a.localeCompare(b, 'es')),
  })
  return data ?? []
}
