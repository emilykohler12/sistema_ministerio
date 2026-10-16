import { EmptyState } from '@/shared/components/ui/EmptyState'
import { formatFechaCorta, formatMes } from '@/shared/lib/date'
import { formatoEntero } from '../formato'
import type { PuntoSerie } from '../types'
import { Barra } from './Barra'

interface SerieDescargasProps {
  serie: PuntoSerie[]
  porMes: boolean
  /** Sin descargas en el período se muestra el estado vacío en lugar de una columna de ceros. */
  vacia: boolean
}

/** Tabla accesible con una barra CSS por fila; los días o meses sin descargas llegan en 0. */
export function SerieDescargas({ serie, porMes, vacia }: SerieDescargasProps) {
  if (vacia) return <EmptyState title="Sin descargas en el período" />
  const maximo = Math.max(0, ...serie.map((p) => p.descargas))
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-gray-100 text-gray-500">
        <tr>
          <th className="py-2 pr-4 font-medium">{porMes ? 'Mes' : 'Día'}</th>
          <th className="w-full py-2 pr-4 font-medium">
            <span className="sr-only">Proporción</span>
          </th>
          <th className="py-2 text-right font-medium">Descargas</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {serie.map((p) => (
          <tr key={p.inicio}>
            <td className="whitespace-nowrap py-2 pr-4 text-gray-700">{porMes ? formatMes(p.inicio) : formatFechaCorta(p.inicio)}</td>
            <td className="w-full py-2 pr-4">
              <Barra valor={p.descargas} maximo={maximo} />
            </td>
            <td className="py-2 text-right font-medium text-gray-800">{formatoEntero(p.descargas)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
