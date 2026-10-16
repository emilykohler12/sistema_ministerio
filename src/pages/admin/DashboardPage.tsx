import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { conPorcentajes } from '@/features/dashboard/calculos'
import { KpiCard } from '@/features/dashboard/components/KpiCard'
import { Seccion } from '@/features/dashboard/components/Seccion'
import { SelectorPeriodo } from '@/features/dashboard/components/SelectorPeriodo'
import { SerieDescargas } from '@/features/dashboard/components/SerieDescargas'
import { TablaLocalidades } from '@/features/dashboard/components/TablaLocalidades'
import { TablaNormativas } from '@/features/dashboard/components/TablaNormativas'
import { TablaPorcentajes } from '@/features/dashboard/components/TablaPorcentajes'
import { TablaRanking } from '@/features/dashboard/components/TablaRanking'
import type { Metricas } from '@/features/dashboard/types'
import { useMetricas } from '@/features/dashboard/hooks/useMetricas'
import {
  parametrosDePeriodo,
  periodoDesdeUrl,
  validarPeriodo,
  type TipoPeriodo,
} from '@/features/dashboard/periodo'
import { ETIQUETA_ESTADO } from '@/features/talleres/types'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { Skeleton } from '@/shared/components/ui/Skeleton'
import { cn } from '@/shared/lib/utils'

function CargandoMetricas() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

interface ContenidoMetricasProps {
  datos: Metricas
  porMes: boolean
  /** Los datos son los del período anterior mientras llegan los nuevos. */
  actualizando: boolean
}

function ContenidoMetricas({ datos, porMes, actualizando }: ContenidoMetricasProps) {
  const { resumen, serie, talleres, niveles, cargos, localidades, normativas } = datos
  const sinDescargas = resumen.descargas === 0
  const sinVincular = resumen.sin_vincular
  return (
    <div aria-busy={actualizando} className={cn('space-y-4', actualizando && 'opacity-60')}>
      <section aria-label="Resumen" className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Descargas" value={resumen.descargas} />
          <KpiCard label="Establecimientos alcanzados" value={resumen.establecimientos_alcanzados} />
          <KpiCard label="Talleres publicados" value={resumen.talleres_publicados} />
          <KpiCard label="Normativas" value={normativas.length} />
        </div>
        {sinVincular > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {sinVincular} {sinVincular === 1 ? 'institución' : 'instituciones'} sin vincular
          </p>
        )}
      </section>

      <Seccion titulo="Descargas en el tiempo" descripcion={porMes ? 'Por mes.' : 'Por día.'}>
        <SerieDescargas serie={serie} porMes={porMes} vacia={sinDescargas} />
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Ranking de talleres">
          <TablaRanking talleres={talleres} etiquetasEstado={ETIQUETA_ESTADO} vacia={sinDescargas} />
        </Seccion>
        <div className="space-y-4">
          <Seccion titulo="Descargas por nivel">
            <TablaPorcentajes
              columna="Nivel"
              filas={conPorcentajes(niveles).map((n) => ({ ...n, clave: n.nivel_id }))}
              vacia={sinDescargas}
            />
          </Seccion>
          <Seccion titulo="Descargas por cargo">
            <TablaPorcentajes
              columna="Cargo"
              filas={conPorcentajes(cargos).map((c) => ({ ...c, clave: c.cargo, nombre: c.cargo }))}
              vacia={sinDescargas}
            />
          </Seccion>
        </div>
      </div>

      <Seccion
        titulo="Descargas por localidad"
        descripcion="La cobertura es la proporción de establecimientos activos del padrón que descargaron en el período."
      >
        <TablaLocalidades localidades={localidades} />
      </Seccion>

      <Seccion titulo="Normativas" descripcion="Total histórico: el contador no depende del período.">
        <TablaNormativas normativas={normativas} />
      </Seccion>
    </div>
  )
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const periodo = periodoDesdeUrl(searchParams)
  const errorPeriodo = validarPeriodo(periodo)
  const { data, isError, isPending, isPlaceholderData, refetch } = useMetricas(periodo)

  const elegirTipo = (tipo: TipoPeriodo) => setSearchParams(parametrosDePeriodo({ ...periodo, tipo }))

  const elegirRango = useCallback(
    (desde: string, hasta: string) =>
      setSearchParams(parametrosDePeriodo({ tipo: 'rango', desde, hasta, porMes: false }), { replace: true }),
    [setSearchParams],
  )

  return (
    <div>
      <div className="mb-6 space-y-4">
        <h1 className="text-2xl font-bold text-primary-800">Dashboard</h1>
        <SelectorPeriodo periodo={periodo} error={errorPeriodo} onTipo={elegirTipo} onRango={elegirRango} />
      </div>

      {errorPeriodo === null && isError && <ErrorFallback onRetry={() => refetch()} />}
      {errorPeriodo === null && !isError && isPending && <CargandoMetricas />}
      {errorPeriodo === null && !isError && data && (
        <ContenidoMetricas datos={data} porMes={periodo.porMes} actualizando={isPlaceholderData} />
      )}
    </div>
  )
}
