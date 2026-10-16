import { useState } from 'react'
import { Badge } from '@/shared/components/ui/Badge'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ordenarTalleres } from '../calculos'
import { formatoEntero } from '../formato'
import type { FilaTaller } from '../types'
import { VerTodos } from './VerTodos'

const LIMITE = 10

const VARIANTE_ESTADO = { BORRADOR: 'neutral', PUBLICADO: 'success', INACTIVO: 'warning' } as const satisfies Record<
  FilaTaller['estado'],
  'neutral' | 'success' | 'warning'
>

interface TablaRankingProps {
  talleres: FilaTaller[]
  /** Etiqueta en español de cada estado (la define el dominio `talleres`; la pasa la página). */
  etiquetasEstado: Record<FilaTaller['estado'], string>
  vacia: boolean
}

/** Talleres con descargas en el período, sin importar su estado actual: los no publicados llevan su estado. */
export function TablaRanking({ talleres, etiquetasEstado, vacia }: TablaRankingProps) {
  const [todos, setTodos] = useState(false)
  if (vacia) return <EmptyState title="Sin descargas en el período" />
  const ordenados = ordenarTalleres(talleres)
  const visibles = todos ? ordenados : ordenados.slice(0, LIMITE)
  return (
    <>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-100 text-gray-500">
          <tr>
            <th className="py-2 pr-4 font-medium">Taller</th>
            <th className="py-2 text-right font-medium">Descargas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visibles.map((t) => (
            <tr key={t.taller_id}>
              <td className="py-2 pr-4 text-gray-700">
                {t.titulo}
                {t.estado !== 'PUBLICADO' && (
                  <Badge variant={VARIANTE_ESTADO[t.estado]} className="ml-2">
                    {etiquetasEstado[t.estado]}
                  </Badge>
                )}
              </td>
              <td className="py-2 text-right font-medium text-gray-800">{formatoEntero(t.descargas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ordenados.length > LIMITE && (
        <VerTodos expandido={todos} onAlternar={() => setTodos((v) => !v)} etiqueta="Ver todos" />
      )}
    </>
  )
}
