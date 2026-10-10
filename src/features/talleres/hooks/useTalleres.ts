import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cambiarEstadoTaller, guardarTaller, obtenerTalleres } from '../consultas'
import { filtrarTalleres, type FiltrosTalleres } from '../filtrar'
import type { EstadoTaller, Taller, TallerGuardado } from '../types'

// Una sola clave para todos los hooks: la lista completa se consulta una vez y cada hook filtra con `select`.
// La RLS decide qué ve cada rol (la caché se limpia al cambiar de usuario, 0014): el admin recibe también
// borradores e inactivos, así que el portal filtra los publicados en `soloPublicados`.
const CLAVE = ['talleres'] as const

const soloPublicados = (todos: Taller[]) => todos.filter((t) => t.estado === 'PUBLICADO')

function useTodosLosTalleres<T>(select: (todos: Taller[]) => T) {
  return useQuery({ queryKey: CLAVE, queryFn: obtenerTalleres, select })
}

/** Panel: todos los talleres, de cualquier estado, o solo los de una categoría. */
export function useTalleres(categoriaId?: number) {
  return useTodosLosTalleres((todos) =>
    categoriaId === undefined ? todos : todos.filter((t) => t.categoria_id === categoriaId),
  )
}

/** Panel: un taller de cualquier estado, o `null` si no está. Para el portal usar `useTallerPublicado`. */
export function useTaller(id: number | null) {
  return useTodosLosTalleres((todos) => todos.find((t) => t.id === id) ?? null)
}

/** Panel: nombres únicos de las etiquetas que ya usan los talleres, ordenados, para sugerir en el formulario. */
export function useEtiquetasSugeridas(): string[] {
  const { data } = useTodosLosTalleres((todos) =>
    Array.from(new Set(todos.flatMap((t) => t.etiqueta.map((e) => e.nombre)))).sort((a, b) =>
      a.localeCompare(b, 'es'),
    ),
  )
  return data ?? []
}

/** Portal: solo los talleres publicados (también con sesión de admin), con los filtros aplicados. */
export function useCatalogo(filtros: FiltrosTalleres) {
  return useTodosLosTalleres((todos) => filtrarTalleres(soloPublicados(todos), filtros))
}

/** Portal: un taller publicado, o `null` si no existe o no está publicado. */
export function useTallerPublicado(id: number | null) {
  return useTodosLosTalleres((todos) => soloPublicados(todos).find((t) => t.id === id) ?? null)
}

export function useGuardarTaller() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: TallerGuardado) => guardarTaller(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE }),
  })
}

export function useCambiarEstadoTaller() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: EstadoTaller }) => cambiarEstadoTaller(id, estado),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE }),
  })
}
