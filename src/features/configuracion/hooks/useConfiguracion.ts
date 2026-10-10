import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { guardarConfiguracion, obtenerConfiguracion } from '../consultas'
import type { ConfiguracionCambios } from '../types'

export function useConfiguracion() {
  return useQuery({
    queryKey: ['configuracion'],
    queryFn: obtenerConfiguracion,
  })
}

export function useGuardarConfiguracion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cambios: ConfiguracionCambios) => guardarConfiguracion(cambios),
    onSuccess: (fila) => {
      queryClient.setQueryData(['configuracion'], fila)
    },
  })
}
