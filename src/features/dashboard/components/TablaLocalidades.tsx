import { useState } from 'react'
import { cobertura, ordenarLocalidades } from '../calculos'
import { formatoEntero, formatoPorcentaje } from '../formato'
import type { FilaLocalidad } from '../types'
import { VerTodos } from './VerTodos'

const LIMITE = 10

/** Las 79 localidades: descargas por la localidad declarada; alcanzados y padrón por la del establecimiento. */
export function TablaLocalidades({ localidades }: { localidades: FilaLocalidad[] }) {
  const [todas, setTodas] = useState(false)
  const ordenadas = ordenarLocalidades(localidades)
  const visibles = todas ? ordenadas : ordenadas.slice(0, LIMITE)
  return (
    <>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-100 text-gray-500">
          <tr>
            <th className="py-2 pr-4 font-medium">Localidad</th>
            <th className="py-2 pr-4 text-right font-medium">Descargas</th>
            <th className="py-2 pr-4 text-right font-medium">Alcanzados</th>
            <th className="py-2 pr-4 text-right font-medium">Padrón</th>
            <th className="py-2 text-right font-medium">Cobertura</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visibles.map((l) => (
            <tr key={l.localidad_id}>
              <td className="py-2 pr-4 text-gray-700">{l.nombre}</td>
              <td className="py-2 pr-4 text-right font-medium text-gray-800">{formatoEntero(l.descargas)}</td>
              <td className="py-2 pr-4 text-right text-gray-600">{formatoEntero(l.alcanzados)}</td>
              <td className="py-2 pr-4 text-right text-gray-600">{formatoEntero(l.padron)}</td>
              <td className="whitespace-nowrap py-2 text-right text-gray-600">
                {formatoPorcentaje(cobertura(l.alcanzados, l.padron))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ordenadas.length > LIMITE && (
        <VerTodos expandido={todas} onAlternar={() => setTodas((v) => !v)} etiqueta="Ver todas" />
      )}
    </>
  )
}
