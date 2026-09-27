import { useState } from 'react'
import { useNormativas } from '@/features/normativas/hooks/useNormativas'
import { NIVELES_FILTRO } from '@/features/talleres/types'
import { TallerBuscador } from '@/features/talleres/components/TallerBuscador'
import { Select } from '@/shared/components/ui/Select'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { TableSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { formatFecha } from '@/shared/lib/date'
import type { Nivel } from '@/features/talleres/types'

export function NormativasPublicPage() {
  const [busqueda, setBusqueda] = useState('')
  const [nivel, setNivel] = useState<Nivel | ''>('')
  const normativas = useNormativas({ busqueda: busqueda || undefined, nivel: nivel || undefined })

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-primary-800">Normativas</h1>
      <p className="mt-1 text-sm text-gray-500">Resoluciones, disposiciones y decretos vigentes.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <TallerBuscador value={busqueda} onChange={setBusqueda} />
        <div className="sm:w-64">
          <Select value={nivel} onChange={(e) => setNivel(e.target.value as Nivel | '')}>
            <option value="">Nivel</option>
            {NIVELES_FILTRO.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {normativas.isLoading && <TableSkeleton />}
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
                  <p className="text-sm text-gray-500">
                    {formatFecha(n.fecha)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="primary">{n.nivel === 'todos' ? 'Todos los niveles' : `Nivel ${n.nivel}`}</Badge>
                  <Button variant="outline" size="sm">
                    Descargar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
