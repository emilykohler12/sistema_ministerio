import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  cambiarContrasena,
  verificarEnlace,
  type ResultadoCambiar,
  type ResultadoVerificar,
} from '@/features/auth/consultas'

export type ResultadoRestablecer = Exclude<ResultadoVerificar, 'ok'> | ResultadoCambiar

interface Datos {
  tokenHash: string
  password: string
}

/**
 * Verifica el enlace y cambia la contraseña. El token es de un solo uso: una vez verificado, el reintento (por
 * ejemplo tras `same_password` o un fallo de red al guardar) solo vuelve a cambiar la contraseña.
 */
export function useRestablecerContrasena() {
  const verificado = useRef(false)
  return useMutation({
    mutationFn: async ({ tokenHash, password }: Datos): Promise<ResultadoRestablecer> => {
      if (!verificado.current) {
        const codigo = await verificarEnlace(tokenHash)
        if (codigo !== 'ok') return codigo
        verificado.current = true
      }
      return cambiarContrasena(password)
    },
  })
}
