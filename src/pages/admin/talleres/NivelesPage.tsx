import { Link } from 'react-router-dom'
import { NIVELES } from '@/features/talleres/types'
import { useCategorias } from '@/features/talleres/hooks/useCategorias'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'

export function NivelesPage() {
  const categorias = useCategorias()

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-800">Talleres</h1>
      <p className="mt-1 text-sm text-gray-500">Elegí un nivel educativo para ver sus categorías.</p>

      {categorias.isError && (
        <div className="mt-6">
          <ErrorFallback onRetry={() => categorias.refetch()} />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {NIVELES.map((nivel) => {
          const cantidad = (categorias.data ?? []).filter((c) => c.nivel_id === nivel.id && c.activo).length
          return (
            <Link
              key={nivel.id}
              to={`/admin/talleres/${nivel.id}`}
              className="flex flex-col items-start rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
            >
              <span className="text-lg font-semibold text-primary-800">{nivel.nombre}</span>
              <span className="mt-1 text-sm text-gray-500">{cantidad} categorías</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
