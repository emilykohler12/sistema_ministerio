import { useMutation } from '@tanstack/react-query'
import { cerrarSesion } from '@/features/auth/consultas'

/** Cierra la sesión (la de recuperación que dejó `verifyOtp`). Para las pantallas fuera de `AuthProvider`. */
export function useCerrarSesion() {
  return useMutation({ mutationFn: cerrarSesion })
}
