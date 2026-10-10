import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  actualizarEstablecimiento,
  crearEstablecimiento,
  obtenerEstablecimiento,
  obtenerEstablecimientos,
  obtenerLocalidades,
} from '../consultas'
import type { CambiosEstablecimiento, DatosEstablecimiento } from '../types'

export const CLAVE_LOCALIDADES = ['localidades'] as const
export const CLAVE_ESTABLECIMIENTOS = ['establecimientos'] as const

/** Las localidades cambian por migración, no en la sesión: nunca se quedan desactualizadas. */
export function useLocalidades() {
  return useQuery({ queryKey: CLAVE_LOCALIDADES, queryFn: obtenerLocalidades, staleTime: Infinity })
}

/** Establecimientos de una localidad; sin localidad (`null`) no consulta. */
export function useEstablecimientos(localidadId: number | null) {
  return useQuery({
    queryKey: [...CLAVE_ESTABLECIMIENTOS, localidadId],
    queryFn: () => obtenerEstablecimientos(localidadId as number),
    enabled: localidadId !== null,
  })
}

/** Un establecimiento por id, o `null` si no existe; sin id (`null`) no consulta. */
export function useEstablecimiento(id: number | null) {
  return useQuery({
    queryKey: [...CLAVE_ESTABLECIMIENTOS, 'detalle', id],
    queryFn: () => obtenerEstablecimiento(id as number),
    enabled: id !== null,
  })
}

export function useCrearEstablecimiento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: DatosEstablecimiento) => crearEstablecimiento(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_ESTABLECIMIENTOS }),
  })
}

export function useActualizarEstablecimiento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: CambiosEstablecimiento }) =>
      actualizarEstablecimiento(id, cambios),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_ESTABLECIMIENTOS }),
  })
}
