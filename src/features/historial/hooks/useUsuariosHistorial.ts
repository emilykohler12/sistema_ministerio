import { useQuery } from '@tanstack/react-query'
import { obtenerUsuariosHistorial } from '../consultas'

export function useUsuariosHistorial() {
  return useQuery({ queryKey: ['historial', 'usuarios'], queryFn: obtenerUsuariosHistorial })
}
