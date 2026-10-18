import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { Badge } from '@/shared/components/ui/Badge'
import { formatFechaHoraArgentina } from '@/shared/lib/date'
import { cambios } from '../diff'
import { describir, entidadDeTabla } from '../entidades'
import type { Operacion } from '../types'
import { nombreDeUsuario } from '../usuarios'
import { DetalleOperacion } from './DetalleOperacion'

const ACCION = {
  INSERT: { etiqueta: 'Alta', variante: 'success' },
  UPDATE: { etiqueta: 'Modificación', variante: 'secondary' },
  DELETE: { etiqueta: 'Baja', variante: 'warning' },
} as const

interface TablaHistorialProps {
  operaciones: Operacion[]
  /** Email por `usuario_id`; vacío si falló la consulta de usuarios (se muestra el uuid corto). */
  emails: ReadonlyMap<string, string>
  /** `id` de la operación expandida, o null. */
  expandida: number | null
  onAlternar: (id: number) => void
}

function Usuario({ id, emails }: { id: string | null; emails: ReadonlyMap<string, string> }) {
  const nombre = nombreDeUsuario(id, emails)
  if (id === null) return <span className="text-gray-500">{nombre}</span>
  if (emails.has(id)) return <span>{nombre}</span>
  return (
    <span title={id} className="font-mono text-xs">
      {nombre}
    </span>
  )
}

export function TablaHistorial({ operaciones, emails, expandida, onAlternar }: TablaHistorialProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table aria-label="Operaciones" className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-gray-500">
          <tr>
            <th scope="col" className="w-10 px-3 py-2.5">
              <span className="sr-only">Detalle</span>
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Fecha y hora
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Usuario
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Acción
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Entidad
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Registro
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {operaciones.map((op) => {
            const campos = cambios(op)
            const descripcion = describir(op)
            const accion = ACCION[op.operacion as keyof typeof ACCION]
            const abierta = expandida === op.id && campos.length > 0
            const idDetalle = `detalle-operacion-${op.id}`
            return (
              <Fragment key={op.id}>
                <tr className="align-top">
                  <td className="px-3 py-2.5">
                    {campos.length > 0 && (
                      <button
                        type="button"
                        aria-expanded={abierta}
                        aria-controls={abierta ? idDetalle : undefined}
                        onClick={() => onAlternar(op.id)}
                        className="rounded p-0.5 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                      >
                        {abierta ? (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span className="sr-only">{`Cambios de ${descripcion}`}</span>
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">
                    {formatFechaHoraArgentina(op.fecha_hora)}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    <Usuario id={op.usuario_id} emails={emails} />
                  </td>
                  <td className="px-3 py-2.5">
                    {accion ? <Badge variant={accion.variante}>{accion.etiqueta}</Badge> : op.operacion}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{entidadDeTabla(op.tabla)}</td>
                  <td className="break-words px-3 py-2.5 text-gray-700">
                    {descripcion}
                    {campos.length === 0 && (
                      <p className="text-xs italic text-gray-500">Sin cambios en los campos del registro</p>
                    )}
                  </td>
                </tr>
                {abierta && (
                  <tr id={idDetalle}>
                    <td />
                    <td colSpan={5} className="bg-gray-50 px-3 py-3">
                      <DetalleOperacion cambios={campos} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
