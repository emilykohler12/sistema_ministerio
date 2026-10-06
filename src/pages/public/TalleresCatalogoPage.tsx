import { useState } from 'react'
import { TallerBuscador } from '@/features/talleres/components/TallerBuscador'
import { TallerCard } from '@/features/talleres/components/TallerCard'
import { TallerFiltros, type FiltrosState } from '@/features/talleres/components/TallerFiltros'
import { useTalleres } from '@/features/talleres/hooks/useTalleres'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'

export function TalleresCatalogoPage() {
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState<FiltrosState>({ nivel: '', destinatario: '' })

  const talleres = useTalleres({
    busqueda: busqueda || undefined,
    nivel: filtros.nivel || undefined,
    destinatario: filtros.destinatario || undefined,
  })

  return (
    <div className="px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-primary-800">Talleres</h1>
      <p className="mt-1 text-sm text-gray-500">Explorá los talleres disponibles por nivel y destinatario.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <TallerBuscador value={busqueda} onChange={setBusqueda} />
        <div className="sm:w-96">
          <TallerFiltros value={filtros} onChange={setFiltros} />
        </div>
      </div>

      <div className="mt-6">
        {talleres.isLoading && (
          <div className="grid gap-4 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}
        {talleres.isError && <ErrorFallback onRetry={() => talleres.refetch()} />}
        {talleres.isSuccess && talleres.data.length === 0 && (
          <EmptyState title="No encontramos talleres" description="Probá con otros filtros o términos de búsqueda." />
        )}
        {talleres.isSuccess && talleres.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {talleres.data.map((t) => (
              <TallerCard key={t.id} taller={t} linkTo={`/talleres/${t.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
