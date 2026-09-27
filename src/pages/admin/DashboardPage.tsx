import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboardMetrics } from '@/features/dashboard/hooks/useDashboard'
import { KpiCard } from '@/features/dashboard/components/KpiCard'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { Skeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'

export function DashboardPage() {
  const { data, isLoading, isError, refetch } = useDashboardMetrics()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary-800">Dashboard</h1>
      </div>

      {isError && <ErrorFallback onRetry={() => refetch()} />}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Descargas totales" value={data.kpis.descargasTotales} />
            <KpiCard label="Talleres publicados" value={data.kpis.talleresPublicados} />
            <KpiCard label="Normativas publicadas" value={data.kpis.normativasPublicadas} />
            <KpiCard label="Escuelas alcanzadas" value={data.kpis.escuelasAlcanzadas} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Descargas por localidad</CardTitle>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.porLocalidad}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="localidad" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="descargas" fill="var(--color-primary-700)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardTitle>Descargas por fecha</CardTitle>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.porFecha}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip />
                    <Line type="monotone" dataKey="descargas" stroke="var(--color-primary-700)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardTitle>Descargas por nivel</CardTitle>
              <div className="mt-4 space-y-3">
                {data.porNivel.map((item) => (
                  <div key={item.nivel}>
                    <div className="mb-1 flex justify-between text-sm text-gray-600">
                      <span>{item.nivel}</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-gray-100">
                      <div
                        className="h-2.5 rounded-full bg-primary-700"
                        style={{ width: `${item.porcentaje}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardTitle>Descargas por rol</CardTitle>
              <div className="mt-4 space-y-3">
                {data.porRol.map((item) => (
                  <div key={item.rol}>
                    <div className="mb-1 flex justify-between text-sm text-gray-600">
                      <span>{item.rol}</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-gray-100">
                      <div
                        className="h-2.5 rounded-full bg-primary-700"
                        style={{ width: `${item.porcentaje}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
