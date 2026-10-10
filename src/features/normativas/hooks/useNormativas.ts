import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CLAVE_ETIQUETAS } from '@/features/etiquetas/hooks/useEtiquetas'
import { contarDescargaNormativa, obtenerNormativas } from '../consultas'
import { filtrarNormativas, ordenarNormativas } from '../filtrar'
import { altaNormativa, editarNormativa, eliminarNormativa } from '../secuencias'
import type { DatosNormativa, Normativa } from '../types'

// Una sola clave para todos los hooks: la lista completa se consulta una vez y cada hook filtra con `select`.
export const CLAVE_NORMATIVAS = ['normativas'] as const

export interface NormativasFiltro {
  busqueda?: string
}

function useTodasLasNormativas<T>(select: (todas: Normativa[]) => T) {
  return useQuery({ queryKey: CLAVE_NORMATIVAS, queryFn: obtenerNormativas, select })
}

/** Normativas ordenadas (año descendente, luego id descendente) y filtradas por la búsqueda. */
export function useNormativas(filtro: NormativasFiltro = {}) {
  return useTodasLasNormativas((todas) => filtrarNormativas(ordenarNormativas(todas), filtro.busqueda))
}

/** Una normativa por id, o `null` si no existe (o el id es `null`). */
export function useNormativa(id: number | null) {
  return useTodasLasNormativas((todas) => todas.find((n) => n.id === id) ?? null)
}

export function useGuardarNormativa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, datos, archivo }: { id?: number; datos: DatosNormativa; archivo?: File }) => {
      if (id === undefined) {
        if (!archivo) throw new Error('El alta de una normativa requiere el PDF.')
        return altaNormativa(datos, archivo)
      }
      return editarNormativa(id, datos, archivo)
    },
    // El guardado puede crear etiquetas nuevas: las sugerencias de taller y de normativa se refrescan.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: CLAVE_NORMATIVAS }),
        queryClient.invalidateQueries({ queryKey: CLAVE_ETIQUETAS }),
      ]),
  })
}

export function useEliminarNormativa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => eliminarNormativa(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_NORMATIVAS }),
  })
}

const MARCA_DESCARGA = 'normativa-descarga-contada:'

/**
 * Suma la descarga de una normativa sin esperar la respuesta, solo la primera vez por normativa en la visita (marca en
 * `sessionStorage`, antes de llamar). Si el contador falla no se interrumpe nada: es un dato accesorio.
 */
export function contarDescarga(id: number): void {
  try {
    if (sessionStorage.getItem(MARCA_DESCARGA + id)) return
    sessionStorage.setItem(MARCA_DESCARGA + id, '1')
  } catch {
    // Sin sessionStorage (modo privado): se cuenta igual, sin recordar.
  }
  void contarDescargaNormativa(id).catch(() => {})
}
