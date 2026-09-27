import { useQuery } from '@tanstack/react-query'
import {
  descargasPorFechaMock,
  descargasPorLocalidadMock,
  descargasPorNivelMock,
  descargasPorRolMock,
  kpisMock,
} from '../mocks/dashboard.mock'

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 300))
      return {
        kpis: kpisMock,
        porLocalidad: descargasPorLocalidadMock,
        porFecha: descargasPorFechaMock,
        porNivel: descargasPorNivelMock,
        porRol: descargasPorRolMock,
      }
    },
  })
}
