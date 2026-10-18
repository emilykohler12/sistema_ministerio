import type { Json } from '@/shared/types/database'
import type { Cambio } from '../diff'

function mostrar(valor: Json | null): string {
  if (valor === null) return '—'
  return typeof valor === 'string' ? valor : JSON.stringify(valor)
}

/** Tabla campo / antes / después de una operación. Quien la use decide si hay algo que mostrar (`cambios(op)` no vacío). */
export function DetalleOperacion({ cambios }: { cambios: Cambio[] }) {
  return (
    <table aria-label="Cambios del registro" className="w-full text-left text-xs">
      <thead className="border-b border-gray-200 text-gray-500">
        <tr>
          <th scope="col" className="py-1.5 pr-4 font-medium">
            Campo
          </th>
          <th scope="col" className="py-1.5 pr-4 font-medium">
            Antes
          </th>
          <th scope="col" className="py-1.5 font-medium">
            Después
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {cambios.map((c) => (
          <tr key={c.campo} className="align-top">
            <th scope="row" className="py-1.5 pr-4 font-mono font-medium text-gray-700">
              {c.campo}
            </th>
            <td className="break-words py-1.5 pr-4 text-gray-600">{mostrar(c.antes)}</td>
            <td className="break-words py-1.5 text-gray-800">{mostrar(c.despues)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
