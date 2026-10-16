import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { obtenerMetricas } from '../consultas'
import { validarPeriodo, type Periodo } from '../periodo'

/** Con un período inválido no consulta: la página muestra el error y no depende de `isPending`. */
export function useMetricas(periodo: Periodo) {
  const { desde, hasta, porMes } = periodo
  return useQuery({
    queryKey: ['dashboard', desde, hasta],
    queryFn: () => obtenerMetricas({ desde, hasta, porMes }),
    enabled: validarPeriodo(periodo) === null,
    placeholderData: keepPreviousData,
  })
}
