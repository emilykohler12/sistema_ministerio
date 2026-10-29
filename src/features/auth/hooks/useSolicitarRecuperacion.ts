import { useMutation } from '@tanstack/react-query'
import { pedirRecuperacion } from '@/features/auth/consultas'

/** Pide el enlace de recuperación. Resuelve 'ok' | 'red'; nunca rechaza. */
export function useSolicitarRecuperacion() {
  return useMutation({
    mutationFn: async (correo: string): Promise<'ok' | 'red'> => {
      try {
        return await pedirRecuperacion(correo)
      } catch {
        return 'red'
      }
    },
  })
}
