import { ExternalLink, File as ArchivoIcono } from 'lucide-react'
import { Badge } from '@/shared/components/ui/Badge'
import { formatearTamanio, idDeYoutube } from '../archivos'
import { ETIQUETA_TIPO_RECURSO, type Recurso } from '../types'

/**
 * Recursos de un taller en el portal: nombre, tipo y tamaño de cada archivo, y el total. Los videos de YouTube se
 * integran con youtube-nocookie.com (0009); otros enlaces van como enlace externo. Sin descarga: llega con el
 * corte descargas. Sin recursos no muestra nada.
 */
export function ListaRecursos({ recursos }: { recursos: Recurso[] }) {
  if (recursos.length === 0) return null
  const archivos = recursos.filter((r) => r.tamanio_bytes !== null)
  const total = archivos.reduce((suma, r) => suma + (r.tamanio_bytes ?? 0), 0)

  return (
    <section className="mt-8 max-w-3xl">
      <h2 className="text-xl font-bold text-primary-800">Recursos</h2>
      <ul className="mt-3 space-y-3">
        {recursos.map((r) => (
          <li key={r.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <ItemRecurso recurso={r} />
          </li>
        ))}
      </ul>
      {archivos.length > 0 && (
        <p className="mt-3 text-sm text-gray-500">Tamaño total: {formatearTamanio(total)}</p>
      )}
    </section>
  )
}

function ItemRecurso({ recurso }: { recurso: Recurso }) {
  const etiqueta = <Badge variant="neutral">{ETIQUETA_TIPO_RECURSO[recurso.tipo]}</Badge>

  if (recurso.tipo === 'ENLACE' && recurso.url !== null) {
    const idVideo = idDeYoutube(recurso.url)
    if (idVideo !== null) {
      return (
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-gray-800">{recurso.nombre}</p>
            {etiqueta}
          </div>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${idVideo}`}
            title={`Video: ${recurso.nombre}`}
            loading="lazy"
            allow="encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="mt-3 aspect-video w-full rounded-lg"
          />
        </div>
      )
    }
    return (
      <div className="flex items-center justify-between gap-3">
        <a
          href={recurso.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-primary-600 hover:underline"
        >
          {recurso.nombre}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        {etiqueta}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-2 font-medium text-gray-800">
        <ArchivoIcono className="h-4 w-4 text-gray-400" aria-hidden="true" />
        {recurso.nombre}
      </p>
      <div className="flex items-center gap-3 text-sm text-gray-500">
        {etiqueta}
        {recurso.tamanio_bytes !== null && <span>{formatearTamanio(recurso.tamanio_bytes)}</span>}
      </div>
    </div>
  )
}
