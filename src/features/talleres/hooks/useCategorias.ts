import { useQuery } from '@tanstack/react-query'
import { categoriasMock } from '../mocks/categorias.mock'
import type { Nivel } from '../types'

async function fetchCategorias(nivel?: Nivel) {
  await new Promise((r) => setTimeout(r, 300))
  if (!nivel) return categoriasMock
  return categoriasMock.filter((c) => c.nivel === nivel || c.nivel === 'todos')
}

export function useCategorias(nivel?: Nivel) {
  return useQuery({
    queryKey: ['categorias', nivel ?? 'all'],
    queryFn: () => fetchCategorias(nivel),
  })
}

export function useCategoria(id: string | undefined) {
  return useQuery({
    queryKey: ['categorias', id],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 200))
      return categoriasMock.find((c) => c.id === id) ?? null
    },
    enabled: !!id,
  })
}
