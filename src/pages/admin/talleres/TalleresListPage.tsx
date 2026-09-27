import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { NIVELES_FILTRO, type Nivel } from '@/features/talleres/types'
import { useCategoria } from '@/features/talleres/hooks/useCategorias'
import { useTalleres } from '@/features/talleres/hooks/useTalleres'
import { TallerBuscador } from '@/features/talleres/components/TallerBuscador'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { TableSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog'
import { formatFechaCorta } from '@/shared/lib/date'

export function TalleresListPage() {
  const { nivel, categoriaId } = useParams<{ nivel: Nivel; categoriaId: string }>()
  const [busqueda, setBusqueda] = useState('')
  const [tallerAEliminar, setTallerAEliminar] = useState<string | null>(null)

  const nivelInfo = NIVELES_FILTRO.find((n) => n.value === nivel)
  const categoria = useCategoria(categoriaId)
  const talleres = useTalleres({ categoriaId, busqueda: busqueda || undefined })

  if (!nivelInfo) return <Navigate to="/admin/talleres" replace />

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Talleres', to: '/admin/talleres' },
          { label: nivelInfo.label, to: `/admin/talleres/${nivel}` },
          { label: categoria.data?.nombre ?? '...' },
        ]}
      />

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-primary-800">{categoria.data?.nombre ?? 'Cargando...'}</h1>
          {categoria.data && (
            <Badge variant="primary" className="mt-2">
              Nivel {categoria.data.nivel === 'todos' ? 'todos' : categoria.data.nivel}
            </Badge>
          )}
        </div>
        <Link to={`/admin/talleres/${nivel}/${categoriaId}/nuevo`}>
          <Button>+ Nuevo taller</Button>
        </Link>
      </div>

      <div className="mt-6">
        <TallerBuscador value={busqueda} onChange={setBusqueda} />
      </div>

      <div className="mt-4">
        {talleres.isLoading && <TableSkeleton />}
        {talleres.isError && <ErrorFallback onRetry={() => talleres.refetch()} />}
        {talleres.isSuccess && talleres.data.length === 0 && (
          <EmptyState
            title="Todavía no hay talleres en esta categoría"
            action={
              <Link to={`/admin/talleres/${nivel}/${categoriaId}/nuevo`}>
                <Button size="sm">+ Nuevo taller</Button>
              </Link>
            }
          />
        )}
        {talleres.isSuccess && talleres.data.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-gray-100 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Título</th>
                  <th className="px-4 py-3 font-medium">Destinado a</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Recursos</th>
                  <th className="px-4 py-3 font-medium">Descargas</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {talleres.data.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-medium text-gray-800">{t.titulo}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{t.destinatarios.join(', ')}</td>
                    <td className="px-4 py-3 text-gray-600">{formatFechaCorta(t.fecha)}</td>
                    <td className="px-4 py-3 text-gray-600">{t.recursos.length}</td>
                    <td className="px-4 py-3 text-gray-600">{t.descargas}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 font-medium">
                        <Link
                          to={`/admin/talleres/${nivel}/${categoriaId}/${t.id}/editar`}
                          className="text-primary-600 hover:underline"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => setTallerAEliminar(t.id)}
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
        open={!!tallerAEliminar}
        onClose={() => setTallerAEliminar(null)}
        onConfirm={() => setTallerAEliminar(null)}
        title="Eliminar taller"
        description="Esta acción no se puede deshacer."
      />
    </div>
  )
}
