import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { obtenerHistorial } from '../consultas'
import { validarFiltros, type FiltrosHistorial } from '../filtros'

/** Con filtros inválidos no consulta: la página muestra el error y no depende de `isPending`. */
export function useHistorial(filtros: FiltrosHistorial) {
  return useQuery({
    queryKey: ['historial', filtros],
    queryFn: () => obtenerHistorial(filtros),
    enabled: validarFiltros(filtros) === null,
    placeholderData: keepPreviousData,
  })
}
