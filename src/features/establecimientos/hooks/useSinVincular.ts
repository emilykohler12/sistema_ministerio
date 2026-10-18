import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { obtenerSinVincular, vincularInstitucion } from '../consultas'
import { CLAVE_ESTABLECIMIENTOS } from './useEstablecimientos'

/** Cuelga de `['establecimientos']`: cualquier cambio del padrón la invalida. */
export const CLAVE_SIN_VINCULAR = [...CLAVE_ESTABLECIMIENTOS, 'sin-vincular'] as const

export function useSinVincular() {
  return useQuery({ queryKey: CLAVE_SIN_VINCULAR, queryFn: obtenerSinVincular })
}

interface VariablesVincular {
  localidadId: number
  nombre: string
  establecimientoId: number
}

/**
 * Devuelve la cantidad de registros vinculados (0 si ya lo estaban). Invalida en `onSettled`, también al fallar: un `DA005`
 * o un 0 prometen una lista y un padrón actualizados. El dashboard cambia (alcanzados y `sin_vincular`).
 */
export function useVincular() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ localidadId, nombre, establecimientoId }: VariablesVincular) =>
      vincularInstitucion(localidadId, nombre, establecimientoId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: CLAVE_ESTABLECIMIENTOS }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  })
}
