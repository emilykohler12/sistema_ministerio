import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getInitials } from '@/shared/lib/utils'
import { urlLogo } from '../consultas'
import { cambiarLogo, quitarLogo } from '../secuencias'
import type { Configuracion } from '../types'
import { useConfiguracion } from './useConfiguracion'

/** URL pública del logo (o `null`), iniciales del nombre y si la configuración sigue cargando. */
export function useLogo(): { isPending: boolean; url: string | null; iniciales: string } {
  const { data, isPending } = useConfiguracion()
  return {
    isPending,
    url: data?.logo_ruta ? urlLogo(data.logo_ruta) : null,
    iniciales: getInitials(data?.nombre ?? ''),
  }
}

/**
 * En éxito deja la fila devuelta en la caché (ya es la real: no hace falta volver a pedirla). Ante un error la
 * invalida: tras un `PGRST116` (otro admin cambió el logo) el `anterior` de la caché ya no es el real y el reintento
 * fallaría siempre.
 */
function useActualizarCache() {
  const queryClient = useQueryClient()
  return {
    onSuccess: (fila: Configuracion) => queryClient.setQueryData(['configuracion'], fila),
    onError: () => queryClient.invalidateQueries({ queryKey: ['configuracion'] }),
  }
}

export function useCambiarLogo() {
  const cache = useActualizarCache()
  return useMutation({
    mutationKey: ['configuracion', 'cambiar-logo'],
    mutationFn: ({ file, anterior }: { file: File; anterior: string | null }) => cambiarLogo(file, anterior),
    ...cache,
  })
}

export function useQuitarLogo() {
  const cache = useActualizarCache()
  return useMutation({
    mutationKey: ['configuracion', 'quitar-logo'],
    mutationFn: ({ anterior }: { anterior: string }) => quitarLogo(anterior),
    ...cache,
  })
}
