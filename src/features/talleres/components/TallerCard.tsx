import { Link } from 'react-router-dom'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { nombreNivel, type Taller } from '../types'

interface TallerCardProps {
  taller: Taller
  linkTo: string
  /** Se oculta donde el nivel es obvio, por ejemplo entre los similares de una misma categoría. */
  mostrarNivel?: boolean
}

export function TallerCard({ taller, linkTo, mostrarNivel = true }: TallerCardProps) {
  return (
    <article className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {mostrarNivel && (
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Nivel {nombreNivel(taller.categoria.nivel_id).toLowerCase()}
        </p>
      )}
      <h3 className="mt-1 text-base font-semibold text-primary-800">{taller.nombre}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {taller.destinatario.slice(0, 1).map((d) => (
          <Badge key={d.id} variant="secondary">
            {d.nombre}
          </Badge>
        ))}
      </div>
      <div className="mt-4">
        <Link to={linkTo}>
          <Button size="sm">Ver</Button>
        </Link>
      </div>
    </article>
  )
}
