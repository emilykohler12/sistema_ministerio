import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configuracionMock } from '../mocks/configuracion.mock'
import type { ConfiguracionInstitucional } from '../types'

export function useConfiguracion() {
  return useQuery({
    queryKey: ['configuracion'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 300))
      return configuracionMock
    },
  })
}

export function useGuardarConfiguracion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ConfiguracionInstitucional) => {
      await new Promise((r) => setTimeout(r, 400))
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['configuracion'], data)
    },
  })
}
