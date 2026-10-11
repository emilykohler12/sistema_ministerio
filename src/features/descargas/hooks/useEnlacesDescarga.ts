import { useQuery } from '@tanstack/react-query'
import type { Recurso } from '@/features/recursos/types'
import { firmarEnlaces } from '../consultas'

export const CLAVE_ENLACES_DESCARGA = ['descargas', 'enlaces'] as const

/**
 * Enlaces firmados de un taller (lectura idempotente, separada del registro). `gcTime: 0`: se firma de nuevo en cada
 * apertura y no se guardan URLs de 1 h. Un reintento (una firma rechazada no tiene que esperar tres) y sin refetch al
 * recuperar el foco, que firmaría de nuevo sin que nadie lo pida. "Reintentar" es `refetch`: no puede registrar.
 */
export function useEnlacesDescarga(taller: { id: number; recurso: Recurso[] }, habilitado: boolean) {
  return useQuery({
    queryKey: [...CLAVE_ENLACES_DESCARGA, taller.id],
    queryFn: () => firmarEnlaces(taller.recurso),
    enabled: habilitado,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}
