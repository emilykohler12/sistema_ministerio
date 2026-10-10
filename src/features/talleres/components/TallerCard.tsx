import { Link } from 'react-router-dom'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { formatFecha } from '@/shared/lib/date'
import { destinatarioLabel, type Taller } from '../types'

const TIPO_LABEL: Record<string, string> = { pdf: 'PDF', video: 'Video', imagen: 'Imagen' }

export function TallerCard({ taller, linkTo }: { taller: Taller; linkTo?: string }) {
  const tipoPrincipal = taller.recursos[0]?.tipo ?? 'pdf'

  return (
    <article className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{TIPO_LABEL[tipoPrincipal]}</p>
      <h3 className="mt-1 text-base font-semibold text-primary-800">{taller.titulo}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {taller.destinatarios.slice(0, 1).map((d) => (
          <Badge key={d} variant="secondary">
            {destinatarioLabel(d)}
          </Badge>
        ))}
      </div>
      <p className="mt-2 text-sm text-gray-500">
        {formatFecha(taller.fecha)}
      </p>
      <div className="mt-4">
        {linkTo ? (
          <Link to={linkTo}>
            <Button size="sm">Ver</Button>
          </Link>
        ) : (
          <Button size="sm">Descargar</Button>
        )}
      </div>
    </article>
  )
}
