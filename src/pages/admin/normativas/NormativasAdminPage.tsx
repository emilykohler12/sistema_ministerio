import { useState } from 'react'
import { Link } from 'react-router-dom'
import { mensajeDeErrorNormativa } from '@/features/normativas/errores'
import { useEliminarNormativa, useNormativas } from '@/features/normativas/hooks/useNormativas'
import type { Normativa } from '@/features/normativas/types'
import { Buscador } from '@/shared/components/ui/Buscador'
import { Button } from '@/shared/components/ui/Button'
import { TableSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { FieldError } from '@/shared/components/ui/FieldError'
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog'

export function NormativasAdminPage() {
  const [busqueda, setBusqueda] = useState('')
  const [aEliminar, setAEliminar] = useState<Normativa | null>(null)
  const [errorBaja, setErrorBaja] = useState<string | null>(null)
  const normativas = useNormativas({ busqueda: busqueda || undefined })
  const eliminar = useEliminarNormativa()

  function confirmarBaja() {
    if (!aEliminar) return
    setErrorBaja(null)
    eliminar.mutate(aEliminar.id, { onError: (error) => setErrorBaja(mensajeDeErrorNormativa(error)) })
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary-800">Normativas</h1>
        <Link to="/admin/normativas/nueva">
          <Button>Nueva normativa</Button>
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Buscador value={busqueda} onChange={setBusqueda} etiqueta="Buscar por título, número o etiqueta" placeholder="Buscar por título, número o etiqueta..." />
      </div>

      {errorBaja && <FieldError id="baja-error" message={errorBaja} />}

      <div className="mt-4">
        {normativas.isPending && <TableSkeleton />}
        {normativas.isError && <ErrorFallback onRetry={() => normativas.refetch()} />}
        {normativas.isSuccess && normativas.data.length === 0 && (
          <EmptyState
            title="No hay normativas cargadas"
            action={
              <Link to="/admin/normativas/nueva">
                <Button size="sm">Nueva normativa</Button>
              </Link>
            }
          />
        )}
        {normativas.isSuccess && normativas.data.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-gray-100 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Título</th>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Etiquetas</th>
                  <th className="px-4 py-3 font-medium">Año</th>
                  <th className="px-4 py-3 font-medium">Descargas</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {normativas.data.map((n) => (
                  <tr key={n.id}>
                    <td className="px-4 py-3 font-medium text-gray-800">{n.titulo}</td>
                    <td className="px-4 py-3 text-gray-600">{n.numero}</td>
                    <td className="px-4 py-3 text-gray-600">{n.etiqueta.map((e) => e.nombre).join(', ')}</td>
                    <td className="px-4 py-3 text-gray-600">{n.anio}</td>
                    <td className="px-4 py-3 text-gray-600">{n.descargas}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 font-medium">
                        <Link to={`/admin/normativas/nueva?editar=${n.id}`} className="text-primary-600 hover:underline">
                          Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => setAEliminar(n)}
                          className="text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!aEliminar}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarBaja}
        title="Eliminar normativa"
        description="Esta acción no se puede deshacer."
      />
    </div>
  )
}
