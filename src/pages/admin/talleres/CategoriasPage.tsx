import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { NIVELES_FILTRO, nivelLabel, type Nivel } from '@/features/talleres/types'
import { useCategorias } from '@/features/talleres/hooks/useCategorias'
import { useTalleres } from '@/features/talleres/hooks/useTalleres'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Button } from '@/shared/components/ui/Button'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog'

export function CategoriasPage() {
  const { nivel } = useParams<{ nivel: Nivel }>()
  const [categoriaAEliminar, setCategoriaAEliminar] = useState<string | null>(null)
  const categorias = useCategorias(nivel)
  const talleres = useTalleres({})

  const nivelInfo = NIVELES_FILTRO.find((n) => n.value === nivel)
  if (!nivelInfo) return <Navigate to="/admin/talleres" replace />

  function contarTalleres(categoriaId: string) {
    return (talleres.data ?? []).filter((t) => t.categoriaId === categoriaId).length
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Talleres', to: '/admin/talleres' }, { label: nivelInfo.label }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary-800">Talleres</h1>
        <Link to={`/admin/talleres/${nivel}/nueva-categoria`}>
          <Button>Nueva categoría</Button>
        </Link>
      </div>

      <div className="mt-6">
        {categorias.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}
        {categorias.isError && <ErrorFallback onRetry={() => categorias.refetch()} />}
        {categorias.isSuccess && categorias.data.length === 0 && (
          <EmptyState
            title="Este nivel todavía no tiene categorías"
            description="Creá la primera categoría para empezar a cargar talleres."
            action={
              <Link to={`/admin/talleres/${nivel}/nueva-categoria`}>
                <Button size="sm">Nueva categoría</Button>
              </Link>
            }
          />
        )}
        {categorias.isSuccess && categorias.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.data.map((cat) => (
              <div key={cat.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Nivel {nivelLabel(cat.nivel).toLowerCase()}
                </p>
                <Link
                  to={`/admin/talleres/${nivel}/${cat.id}`}
                  className="mt-1 block text-lg font-semibold text-primary-800 hover:underline"
                >
                  {cat.nombre}
                </Link>
                <p className="mt-1 text-sm text-gray-500">{contarTalleres(cat.id)} talleres</p>
                <div className="mt-3 flex gap-4 text-sm font-medium">
                  <Link to={`/admin/talleres/${nivel}/nueva-categoria?editar=${cat.id}`} className="text-primary-600 hover:underline">
                    Editar
                  </Link>
                  <button
                    type="button"
                    onClick={() => setCategoriaAEliminar(cat.id)}
                    className="text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!categoriaAEliminar}
        onClose={() => setCategoriaAEliminar(null)}
        onConfirm={() => setCategoriaAEliminar(null)}
        title="Eliminar categoría"
        description="Esta acción no se puede deshacer. Los talleres asociados no se eliminarán."
      />
    </div>
  )
}
