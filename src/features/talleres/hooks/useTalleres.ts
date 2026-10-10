import { useQuery } from '@tanstack/react-query'
import { talleresMock } from '../mocks/talleres.mock'
import type { Destinatario } from '../types'

export interface TalleresFiltro {
  categoriaId?: number
  destinatario?: Destinatario
  busqueda?: string
}

async function fetchTalleres(filtro: TalleresFiltro) {
  await new Promise((r) => setTimeout(r, 300))
  return talleresMock.filter((t) => {
    if (filtro.categoriaId !== undefined && t.categoriaId !== filtro.categoriaId) return false
    if (filtro.destinatario && !t.destinatarios.includes(filtro.destinatario)) return false
    if (filtro.busqueda) {
      const q = filtro.busqueda.toLowerCase()
      const matches =
        t.titulo.toLowerCase().includes(q) || t.etiquetas.some((e) => e.toLowerCase().includes(q))
      if (!matches) return false
    }
    return true
  })
}

export function useTalleres(filtro: TalleresFiltro = {}) {
  return useQuery({
    queryKey: ['talleres', filtro],
    queryFn: () => fetchTalleres(filtro),
  })
}

export function useTaller(id: string | undefined) {
  return useQuery({
    queryKey: ['talleres', 'detalle', id],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 200))
      return talleresMock.find((t) => t.id === id) ?? null
    },
    enabled: !!id,
  })
}

export function useNombresInstitucionSugeridos() {
  return [] as string[]
}

export function useEtiquetasSugeridas() {
  const set = new Set<string>()
  for (const t of talleresMock) {
    for (const e of t.etiquetas) set.add(e)
  }
  return Array.from(set)
}
