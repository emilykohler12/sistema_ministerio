import { useState } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useConfiguracion } from '@/features/configuracion/hooks/useConfiguracion'
import { useNormativas } from '@/features/normativas/hooks/useNormativas'
import { NIVELES_FILTRO } from '@/features/talleres/types'
import { useTalleres } from '@/features/talleres/hooks/useTalleres'
import { TallerCard } from '@/features/talleres/components/TallerCard'
import { Button } from '@/shared/components/ui/Button'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'

export function HomePage() {
  const [busqueda, setBusqueda] = useState('')
  const talleres = useTalleres({})
  const normativas = useNormativas({})
  const { data: config } = useConfiguracion()

  const destacados = (talleres.data ?? []).slice(0, 3)
  const talleresRecientes = (talleres.data ?? []).slice(3, 6)
  const normativasRecientes = (normativas.data ?? []).slice(0, 3)

  const tieneMisionOVision = !!(config?.mision || config?.vision)

  return (
    <div>
      <section className="bg-primary-800 px-4 py-12 text-white sm:px-6">
        <div className="mx-auto grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              {config?.nombre || 'Sitio institucional'}
            </h1>
            {config?.quienesSomos && (
              <div className="mt-4 max-w-md">
                <h2 className="text-lg font-semibold">Quiénes somos</h2>
                <p className="mt-1 text-sm text-white/90">{config.quienesSomos}</p>
              </div>
            )}
          </div>

          {tieneMisionOVision && (
            <div className="grid gap-4 sm:grid-cols-2">
              {config?.mision && (
                <div className="rounded-xl bg-primary-700/60 p-4">
                  <h3 className="font-semibold">Misión</h3>
                  <p className="mt-1 text-sm text-white/90">{config.mision}</p>
                </div>
              )}
              {config?.vision && (
                <div className="rounded-xl bg-primary-700/60 p-4">
                  <h3 className="font-semibold">Visión</h3>
                  <p className="mt-1 text-sm text-white/90">{config.vision}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="mx-auto mt-10 flex flex-col gap-2 rounded-xl bg-white p-2 shadow-lg sm:flex-row"
        >
          <label htmlFor="home-search" className="sr-only">
            Buscar recursos
          </label>
          <div className="flex flex-1 items-center gap-2 px-3">
            <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
            <input
              id="home-search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar recursos..."
              className="w-full py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
          </div>
          <Button type="submit" variant="primary" className="sm:w-auto">
            Buscar
          </Button>
        </form>
      </section>

      <section className="px-4 py-10 sm:px-6">
        <h2 className="mb-4 text-xl font-bold text-primary-800">Destacados</h2>
        {talleres.isLoading && (
          <div className="grid gap-4 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}
        {talleres.isError && <ErrorFallback onRetry={() => talleres.refetch()} />}
        {talleres.isSuccess && destacados.length === 0 && (
          <EmptyState title="Todavía no hay recursos destacados" />
        )}
        {talleres.isSuccess && destacados.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            {destacados.map((t) => (
              <TallerCard key={t.id} taller={t} linkTo={`/talleres/${t.id}`} />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-gray-100 bg-gray-50 px-4 py-10 sm:px-6">
        <div className="">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-primary-800">Normativas</h2>
            <Link to="/normativas" className="text-sm font-medium text-primary-600 hover:underline">
              Ver todas
            </Link>
          </div>
          {normativas.isLoading && <CardSkeleton />}
          {normativas.isError && <ErrorFallback onRetry={() => normativas.refetch()} />}
          {normativas.isSuccess && normativasRecientes.length === 0 && (
            <EmptyState title="No hay normativas publicadas" />
          )}
          {normativas.isSuccess && normativasRecientes.length > 0 && (
            <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
              {normativasRecientes.map((n) => (
                <li key={n.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-primary-800">{n.titulo}</p>
                    <p className="text-sm text-gray-500">{n.anio}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {n.etiquetas.map((e) => (
                      <span key={e} className="rounded-md bg-primary-700 px-2.5 py-1 text-xs font-semibold text-white">
                        {e}
                      </span>
                    ))}
                    <Button variant="outline" size="sm">
                      Descargar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-primary-800">Talleres</h2>
          <Link to="/talleres" className="text-sm font-medium text-primary-600 hover:underline">
            Ver todos
          </Link>
        </div>
        {talleres.isLoading && (
          <div className="grid gap-4 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}
        {talleres.isSuccess && talleresRecientes.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            {talleresRecientes.map((t) => (
              <TallerCard key={t.id} taller={t} linkTo={`/talleres/${t.id}`} />
            ))}
          </div>
        )}
      </section>

      <p className="sr-only">Niveles disponibles: {NIVELES_FILTRO.map((n) => n.label).join(', ')}</p>
    </div>
  )
}
