import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CLAVE_ESTABLECIMIENTOS } from '@/features/establecimientos/hooks/useEstablecimientos'
import type { Recurso } from '@/features/recursos/types'
import { CLAVE_TALLERES } from '@/features/talleres/hooks/useTalleres'
import { firmarEnlaces, registrarDescarga } from '../consultas'
import { esInstitucionNoDisponible, esTallerNoDisponible } from '../errores'
import type { DatosDescarga, EnlaceDescarga } from '../types'
import { marcarTallerRegistrado, tallerRegistrado } from '../visita'

interface Variables {
  taller: { id: number; recurso: Recurso[] }
  /** Obligatorios la primera vez por taller en la visita; si el taller ya se registró, se ignoran. */
  datos?: DatosDescarga
}

/**
 * Descarga de un taller: registra la descarga si todavía no se registró en esta visita (y solo entonces marca el
 * taller) y firma los enlaces. Volver a llamarla tras una firma fallida solo vuelve a firmar.
 * `DA003` invalida los talleres; `DA004` invalida los establecimientos de la localidad elegida.
 */
export function useDescargarTaller() {
  const queryClient = useQueryClient()
  return useMutation<EnlaceDescarga[], unknown, Variables>({
    mutationFn: async ({ taller, datos }) => {
      if (!tallerRegistrado(taller.id)) {
        if (!datos) throw new Error('Faltan los datos del formulario de descarga')
        await registrarDescarga(taller.id, datos)
        marcarTallerRegistrado(taller.id)
      }
      return firmarEnlaces(taller.recurso)
    },
    onError: (error, { datos }) => {
      if (esTallerNoDisponible(error)) {
        void queryClient.invalidateQueries({ queryKey: CLAVE_TALLERES })
      } else if (esInstitucionNoDisponible(error) && datos) {
        void queryClient.invalidateQueries({ queryKey: [...CLAVE_ESTABLECIMIENTOS, datos.localidad_id] })
      }
    },
  })
}
