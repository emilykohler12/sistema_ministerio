import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { idDeRuta, NIVELES, nombreNivel } from '@/features/talleres/types'
import { useActualizarCategoria, useCategorias } from '@/features/talleres/hooks/useCategorias'
import { useTalleres } from '@/features/talleres/hooks/useTalleres'
import { Badge } from '@/shared/components/ui/Badge'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Button } from '@/shared/components/ui/Button'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog'
import { NoEncontrado } from './NoEncontrado'

export function CategoriasPage() {
  const { nivelId } = useParams<{ nivelId: string }>()
  const nivel = NIVELES.find((n) => n.id === idDeRuta(nivelId))
  const [categoriaADarDeBaja, setCategoriaADarDeBaja] = useState<number | null>(null)
  const categorias = useCategorias(nivel?.id)
  const talleres = useTalleres({})
  const actualizar = useActualizarCategoria()

  if (!nivel) return <NoEncontrado titulo="Nivel no encontrado" />

  function contarTalleres(categoriaId: number) {
    return (talleres.data ?? []).filter((t) => t.categoriaId === categoriaId).length
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Talleres', to: '/admin/talleres' }, { label: nivel.nombre }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary-800">Talleres</h1>
        <Link to={`/admin/talleres/${nivel.id}/nueva-categoria`}>
          <Button>Nueva categoría</Button>
        </Link>
      </div>

      <div className="mt-6">
        {actualizar.isError && (
          <div className="mb-4">
            <ErrorFallback message="No pudimos actualizar la categoría. Probá de nuevo." />
          </div>
        )}
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
              <Link to={`/admin/talleres/${nivel.id}/nueva-categoria`}>
                <Button size="sm">Nueva categoría</Button>
              </Link>
            }
          />
        )}
        {categorias.isSuccess && categorias.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.data.map((cat) => (
              <div key={cat.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Nivel {nombreNivel(cat.nivel_id).toLowerCase()}
                  </p>
                  {!cat.activo && <Badge variant="neutral">Inactiva</Badge>}
                </div>
                <Link
                  to={`/admin/talleres/${nivel.id}/${cat.id}`}
                  className="mt-1 block text-lg font-semibold text-primary-800 hover:underline"
                >
                  {cat.nombre}
                </Link>
                <p className="mt-1 text-sm text-gray-500">{contarTalleres(cat.id)} talleres</p>
                <div className="mt-3 flex gap-4 text-sm font-medium">
                  <Link
                    to={`/admin/talleres/${nivel.id}/nueva-categoria?editar=${cat.id}`}
                    className="text-primary-600 hover:underline"
                  >
                    Editar
                  </Link>
                  {cat.activo ? (
                    <button
                      type="button"
                      onClick={() => setCategoriaADarDeBaja(cat.id)}
                      className="text-red-600 hover:underline"
                    >
                      Dar de baja
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actualizar.isPending}
                      onClick={() => actualizar.mutate({ id: cat.id, cambios: { activo: true } })}
                      className="text-primary-600 hover:underline disabled:opacity-50"
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={categoriaADarDeBaja !== null}
        onClose={() => setCategoriaADarDeBaja(null)}
        onConfirm={() => {
          if (categoriaADarDeBaja !== null) {
            actualizar.mutate({ id: categoriaADarDeBaja, cambios: { activo: false } })
          }
        }}
        title="Dar de baja la categoría"
        description="La categoría deja de verse en el portal. Los talleres asociados no se eliminan y podés reactivarla cuando quieras."
        confirmLabel="Dar de baja"
      />
    </div>
  )
}
