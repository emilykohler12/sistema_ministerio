import type { Categoria } from '../types'
import { useCategorias } from './useCategorias'
import { idDeRuta } from '@/shared/lib/rutas'

export type CategoriaDeRuta =
  | { estado: 'cargando' }
  | { estado: 'error'; reintentar: () => void }
  | { estado: 'no-encontrada' }
  | { estado: 'ok'; categoria: Categoria }

/**
 * Resuelve `:nivelId` y `:categoriaId` de la URL a una categoría. Una sola regla para las pantallas:
 * un id inválido, inexistente o de una categoría que pertenece a otro nivel es "no encontrada".
 */
export function useCategoriaDeRuta(
  nivelId: string | undefined,
  categoriaId: string | undefined,
): CategoriaDeRuta {
  const todas = useCategorias()
  const nivel = idDeRuta(nivelId)
  const id = idDeRuta(categoriaId)

  if (nivel === null || id === null) return { estado: 'no-encontrada' }
  if (todas.data === undefined) {
    return todas.isError
      ? { estado: 'error', reintentar: () => void todas.refetch() }
      : { estado: 'cargando' }
  }
  const categoria = todas.data.find((c) => c.id === id && c.nivel_id === nivel)
  return categoria ? { estado: 'ok', categoria } : { estado: 'no-encontrada' }
}
