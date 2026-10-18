import type { Json } from '@/shared/types/database'
import type { Operacion } from './types'

export interface Cambio {
  campo: string
  antes: Json | null
  despues: Json | null
}

type Fila = Record<string, Json | undefined>

/** El jsonb de una fila como objeto, o null si no hay (o no es un objeto). */
export function filaDe(datos: Json | null): Fila | null {
  return datos !== null && typeof datos === 'object' && !Array.isArray(datos) ? datos : null
}

function iguales(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => iguales(x, b[i]))
  }
  const clavesA = Object.keys(a)
  return clavesA.length === Object.keys(b).length && clavesA.every((k) => k in b && iguales(a[k], b[k]))
}

/**
 * Campos que muestra el detalle: en una modificación, solo los que cambiaron (sin `updated_at`, que cambia en cada guardado);
 * en un alta o una baja, todos. Respeta el orden de las claves del jsonb. Vacío si una modificación solo tocó `updated_at`.
 */
export function cambios(op: Operacion): Cambio[] {
  const antes = filaDe(op.datos_anteriores)
  const despues = filaDe(op.datos_nuevos)
  const campos = [...new Set([...Object.keys(despues ?? {}), ...Object.keys(antes ?? {})])]
  const todos = campos.map((campo) => ({
    campo,
    antes: antes?.[campo] ?? null,
    despues: despues?.[campo] ?? null,
  }))
  if (op.operacion !== 'UPDATE') return todos
  return todos.filter((c) => c.campo !== 'updated_at' && !iguales(c.antes, c.despues))
}
