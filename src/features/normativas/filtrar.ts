import { normalizar } from '@/shared/lib/texto'
import type { Normativa } from './types'

/** Módulo puro: sin imports de Supabase, para probarlo y usarlo sin cargar el cliente. */

/** Busca en título, número, descripción y etiquetas, sin distinguir mayúsculas ni tildes. Conserva el orden recibido. */
export function filtrarNormativas(normativas: Normativa[], busqueda?: string): Normativa[] {
  const consulta = normalizar(busqueda?.trim() ?? '')
  if (consulta === '') return normativas
  return normativas.filter((n) =>
    [n.titulo, n.numero, n.descripcion ?? '', ...n.etiqueta.map((e) => e.nombre)].some((texto) =>
      normalizar(texto).includes(consulta),
    ),
  )
}

/** Copia ordenada por año descendente y, a igual año, por id descendente (lo más nuevo primero). */
export function ordenarNormativas(normativas: Normativa[]): Normativa[] {
  return [...normativas].sort((a, b) => b.anio - a.anio || b.id - a.id)
}
