import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Share2 } from 'lucide-react'
import { useCatalogo, useTallerPublicado } from '@/features/talleres/hooks/useTalleres'
import { idDeRuta, nombreNivel } from '@/features/talleres/types'
import { ListaRecursos } from '@/features/recursos/components/ListaRecursos'
import { TallerCard } from '@/features/talleres/components/TallerCard'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { Skeleton } from '@/shared/components/ui/Skeleton'

export function TallerDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { data: taller, isPending, isError, refetch } = useTallerPublicado(idDeRuta(id))
  const publicados = useCatalogo({})

  if (isPending) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-8 w-80" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <ErrorFallback message="No pudimos cargar este taller." onRetry={() => refetch()} />
      </div>
    )
  }

  // Un id inválido, inexistente o de un taller que no está publicado (aunque haya sesión de admin).
  if (!taller) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <EmptyState
          title="Taller no encontrado"
          description="Revisá el enlace o volvé al catálogo."
          action={
            <Link to="/talleres">
              <Button size="sm" variant="outline">
                Volver a talleres
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  const similares = (publicados.data ?? [])
    .filter((t) => t.categoria_id === taller.categoria_id && t.id !== taller.id)
    .slice(0, 3)

  return (
    <div>
      <div className="px-4 py-10 sm:px-6">
        <Link to="/talleres" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Volver
        </Link>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Nivel {nombreNivel(taller.categoria.nivel_id).toLowerCase()}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-primary-800 sm:text-3xl">{taller.nombre}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {taller.destinatario.map((d) => (
              <Badge key={d.id} variant="secondary">
                {d.nombre}
              </Badge>
            ))}
          </div>
          <p className="mt-4 max-w-3xl text-gray-700">{taller.descripcion}</p>

          {taller.etiqueta.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Etiquetas">
              {taller.etiqueta.map((e) => (
                <li key={e.id} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600">
                  {e.nombre}
                </li>
              ))}
            </ul>
          )}

          <ListaRecursos recursos={taller.recurso} />

          <div className="mt-6">
            <Button variant="outline">
              <Share2 className="h-4 w-4" /> Compartir
            </Button>
          </div>
        </div>
      </div>

      {similares.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-10 sm:px-6">
          <h2 className="mb-4 text-xl font-bold text-primary-800">Talleres similares</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {similares.map((t) => (
              <TallerCard key={t.id} taller={t} linkTo={`/talleres/${t.id}`} mostrarNivel={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
