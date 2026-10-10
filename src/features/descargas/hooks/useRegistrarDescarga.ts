import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CLAVE_ESTABLECIMIENTOS } from '@/features/establecimientos/hooks/useEstablecimientos'
import { registrarDescarga } from '../consultas'
import { esInstitucionNoDisponible } from '../errores'
import type { DatosDescarga } from '../types'
import { marcarTallerRegistrado, tallerRegistrado } from '../visita'

interface Variables {
  tallerId: number
  datos: DatosDescarga
}

/**
 * Registra la descarga de un taller (RPC `registrar_descarga`, 0022). Solo registra si el taller no está marcado en la visita
 * y lo marca recién cuando la RPC responde bien. `DA004` invalida los establecimientos de la localidad elegida; `DA003` no
 * invalida nada acá: el modal invalida los talleres al cerrarse, para que el mensaje se vea (si no, la página pasa a
 * "Taller no encontrado" y desmonta el modal).
 */
export function useRegistrarDescarga() {
  const queryClient = useQueryClient()
  return useMutation<void, unknown, Variables>({
    mutationFn: async ({ tallerId, datos }) => {
      if (tallerRegistrado(tallerId)) return
      await registrarDescarga(tallerId, datos)
    },
    onSuccess: (_, { tallerId }) => marcarTallerRegistrado(tallerId),
    onError: (error, { datos }) => {
      if (esInstitucionNoDisponible(error)) {
        void queryClient.invalidateQueries({ queryKey: [...CLAVE_ESTABLECIMIENTOS, datos.localidad_id] })
      }
    },
  })
}
