import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Share2 } from 'lucide-react'
import { useTaller, useTalleres } from '@/features/talleres/hooks/useTalleres'
import { destinatarioLabel, nivelLabel } from '@/features/talleres/types'
import { TallerCard } from '@/features/talleres/components/TallerCard'
import { DescargaModal } from '@/features/descargas/DescargaModal'
import { Badge } from '@/shared/components/ui/Badge'
import { formatFecha } from '@/shared/lib/date'
import { Button } from '@/shared/components/ui/Button'
import { Skeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'

export function TallerDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { data: taller, isLoading, isError, refetch } = useTaller(id)
  const relacionados = useTalleres({ categoriaId: taller?.categoriaId })
  const [modalOpen, setModalOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-8 w-80" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    )
  }

  if (isError || !taller) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <ErrorFallback message="No pudimos cargar este recurso." onRetry={() => refetch()} />
      </div>
    )
  }

  const recursoPrincipal = taller.recursos[0]

  return (
    <div>
      <div className="px-4 py-10 sm:px-6">
        <Link to="/talleres" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Volver
        </Link>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {recursoPrincipal?.tipo.toUpperCase()}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-primary-800 sm:text-3xl">{taller.titulo}</h1>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="primary">Nivel {nivelLabel(taller.nivel).toLowerCase()}</Badge>
              {taller.destinatarios.map((d) => (
                <Badge key={d} variant="secondary">
                  {destinatarioLabel(d)}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-sm text-gray-500">
              {formatFecha(taller.fecha)}
            </p>
            <p className="mt-4 text-gray-700">{taller.descripcion}</p>

            {taller.etiquetas.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {taller.etiquetas.map((e) => (
                  <span key={e} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600">
                    {e}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <Button onClick={() => setModalOpen(true)}>Descargar</Button>
              <Button variant="outline">
                <Share2 className="h-4 w-4" /> Compartir
              </Button>
            </div>
          </div>

          <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
            Vista previa del {recursoPrincipal?.tipo === 'pdf' ? 'PDF' : recursoPrincipal?.tipo}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-gray-50 px-4 py-10 sm:px-6">
        <div className="">
          <h2 className="mb-4 text-xl font-bold text-primary-800">Recursos similares</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(relacionados.data ?? [])
              .filter((t) => t.id !== taller.id)
              .slice(0, 3)
              .map((t) => (
                <TallerCard key={t.id} taller={t} linkTo={`/talleres/${t.id}`} />
              ))}
          </div>
        </div>
      </div>

      {recursoPrincipal && (
        <DescargaModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          recursoNombre={taller.titulo}
          recursoTipo={recursoPrincipal.tipo}
        />
      )}
    </div>
  )
}
