import { useState } from 'react'
import { EnlaceDescarga } from '@/features/normativas/components/EnlaceDescarga'
import { useNormativas } from '@/features/normativas/hooks/useNormativas'
import { Buscador } from '@/shared/components/ui/Buscador'
import { Badge } from '@/shared/components/ui/Badge'
import { TableSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'

export function NormativasPublicPage() {
  const [busqueda, setBusqueda] = useState('')
  const normativas = useNormativas({ busqueda: busqueda || undefined })

  return (
    <div className="px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-primary-800">Normativas</h1>
      <p className="mt-1 text-sm text-gray-500">Resoluciones, disposiciones y decretos vigentes.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Buscador value={busqueda} onChange={setBusqueda} etiqueta="Buscar por título, número o etiqueta" placeholder="Buscar por título, número o etiqueta..." />
      </div>

      <div className="mt-6">
        {normativas.isPending && <TableSkeleton />}
        {normativas.isError && <ErrorFallback onRetry={() => normativas.refetch()} />}
        {normativas.isSuccess && normativas.data.length === 0 && (
          <EmptyState title="No encontramos normativas" description="Probá con otros filtros." />
        )}
        {normativas.isSuccess && normativas.data.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {normativas.data.map((n) => (
              <li key={n.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-primary-800">
                    {n.titulo} <span className="font-normal text-gray-400">· {n.numero}</span>
                  </p>
                  <p className="text-sm text-gray-500">{n.anio}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {n.etiqueta.map((e) => (
                    <Badge key={e.id} variant="primary">
                      {e.nombre}
                    </Badge>
                  ))}
                  <EnlaceDescarga normativa={n} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
