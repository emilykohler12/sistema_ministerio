import { useQuery } from '@tanstack/react-query'
import type { Nivel } from '@/features/talleres/types'
import { normativasMock } from '../mocks/normativas.mock'

export interface NormativasFiltro {
  nivel?: Nivel
  busqueda?: string
}

async function fetchNormativas(filtro: NormativasFiltro) {
  await new Promise((r) => setTimeout(r, 300))
  return normativasMock.filter((n) => {
    if (filtro.nivel && n.nivel !== filtro.nivel) return false
    if (filtro.busqueda) {
      const q = filtro.busqueda.toLowerCase()
      if (!n.titulo.toLowerCase().includes(q) && !n.numero.toLowerCase().includes(q)) return false
    }
    return true
  })
}

export function useNormativas(filtro: NormativasFiltro = {}) {
  return useQuery({
    queryKey: ['normativas', filtro],
    queryFn: () => fetchNormativas(filtro),
  })
}

export function useNormativa(id: string | undefined) {
  return useQuery({
    queryKey: ['normativas', 'detalle', id],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 200))
      return normativasMock.find((n) => n.id === id) ?? null
    },
    enabled: !!id,
  })
}
