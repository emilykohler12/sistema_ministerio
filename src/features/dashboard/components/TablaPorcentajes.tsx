import { EmptyState } from '@/shared/components/ui/EmptyState'
import { formatoEntero, formatoPorcentaje } from '../formato'
import { Barra } from './Barra'

interface TablaPorcentajesProps {
  /** Encabezado de la primera columna ("Nivel", "Cargo"). */
  columna: string
  filas: { clave: string | number; nombre: string; descargas: number; porcentaje: number | null }[]
  vacia: boolean
}

/** Cantidad y porcentaje sobre el total del período, con una barra CSS por fila. */
export function TablaPorcentajes({ columna, filas, vacia }: TablaPorcentajesProps) {
  if (vacia) return <EmptyState title="Sin descargas en el período" />
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-gray-100 text-gray-500">
        <tr>
          <th className="py-2 pr-4 font-medium">{columna}</th>
          <th className="w-full py-2 pr-4 font-medium">
            <span className="sr-only">Proporción</span>
          </th>
          <th className="py-2 pr-4 text-right font-medium">Descargas</th>
          <th className="py-2 text-right font-medium">Porcentaje</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {filas.map((f) => (
          <tr key={f.clave}>
            <td className="whitespace-nowrap py-2 pr-4 text-gray-700">{f.nombre}</td>
            <td className="w-full py-2 pr-4">
              <Barra valor={f.porcentaje ?? 0} maximo={100} />
            </td>
            <td className="py-2 pr-4 text-right font-medium text-gray-800">{formatoEntero(f.descargas)}</td>
            <td className="whitespace-nowrap py-2 text-right text-gray-600">{formatoPorcentaje(f.porcentaje)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
