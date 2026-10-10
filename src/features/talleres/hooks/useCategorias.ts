import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { actualizarCategoria, crearCategoria, obtenerCategorias } from '../consultas'
import type { Categoria, CategoriaCambios, CategoriaNueva } from '../types'

// Una sola clave para todos los hooks: la lista completa se consulta una vez y cada hook filtra con `select`.
const CLAVE = ['categorias'] as const

export function useCategorias(nivelId?: number) {
  return useQuery({
    queryKey: CLAVE,
    queryFn: obtenerCategorias,
    select: (todas: Categoria[]) =>
      nivelId === undefined ? todas : todas.filter((c) => c.nivel_id === nivelId),
  })
}

export function useCrearCategoria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (nueva: CategoriaNueva) => crearCategoria(nueva),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE }),
  })
}

export function useActualizarCategoria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: CategoriaCambios }) =>
      actualizarCategoria(id, cambios),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE }),
  })
}
