import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ordenarNormativas } from '../calculos'
import { formatoEntero } from '../formato'
import type { NormativaConteo } from '../types'

/** Contador acumulado por normativa (sin período). */
export function TablaNormativas({ normativas }: { normativas: NormativaConteo[] }) {
  if (normativas.length === 0) return <EmptyState title="Todavía no hay normativas cargadas" />
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-gray-100 text-gray-500">
        <tr>
          <th className="py-2 pr-4 font-medium">Normativa</th>
          <th className="py-2 pr-4 font-medium">Número / año</th>
          <th className="py-2 text-right font-medium">Descargas</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {ordenarNormativas(normativas).map((n) => (
          <tr key={n.id}>
            <td className="py-2 pr-4 text-gray-700">{n.titulo}</td>
            <td className="whitespace-nowrap py-2 pr-4 text-gray-600">
              {n.numero} / {n.anio}
            </td>
            <td className="py-2 text-right font-medium text-gray-800">{formatoEntero(n.descargas)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
