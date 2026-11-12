import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { guardarConfiguracion, obtenerConfiguracion } from '../consultas'
import type { ConfiguracionCambios } from '../types'

export function useConfiguracion() {
  return useQuery({
    queryKey: ['configuracion'],
    queryFn: obtenerConfiguracion,
    // Cambia poco y la leen varios componentes a la vez (encabezado, pie, favicon, panel): que montar uno más no
    // dispare otra consulta.
    staleTime: 60_000,
  })
}

export function useGuardarConfiguracion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['configuracion', 'guardar'],
    mutationFn: (cambios: ConfiguracionCambios) => guardarConfiguracion(cambios),
    onSuccess: (fila) => {
      queryClient.setQueryData(['configuracion'], fila)
    },
  })
}
