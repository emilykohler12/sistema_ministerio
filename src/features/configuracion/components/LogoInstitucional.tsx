import { School } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { useLogo } from '../hooks/useLogo'

interface LogoInstitucionalProps {
  /** Tamaño fijo de la caja (`h-9 w-9`, etc.) y colores de las iniciales; se aplica a la imagen, al respaldo y a la carga. */
  className?: string
  /** Decorativo por defecto (`""`): el nombre de la institución está siempre al lado. La vista previa pasa un `alt`. */
  alt?: string
  /** Clases extra solo para las iniciales o el ícono (fondo y color), que no aplican a la imagen. */
  claseFallback?: string
}

/**
 * Logo del Ministerio: la imagen del bucket `logo` o, sin logo (o si no carga), las iniciales del nombre o el ícono
 * `School`. Mientras carga la configuración deja una caja vacía del mismo tamaño para que el diseño no salte.
 */
export function LogoInstitucional({ className, alt = '', claseFallback }: LogoInstitucionalProps) {
  const { isPending, url, iniciales } = useLogo()
  // Guarda la URL que falló y no un booleano: una URL nueva vuelve a intentar con la imagen sin un efecto.
  const [urlRota, setUrlRota] = useState<string | null>(null)

  if (isPending) return <span className={cn('inline-block shrink-0', className)} />

  if (url !== null && url !== urlRota) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center', className)}>
        <img
          key={url}
          src={url}
          alt={alt}
          className="h-full w-full object-contain"
          onError={() => setUrlRota(url)}
        />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-primary-800 text-sm font-bold text-white',
        className,
        claseFallback,
      )}
    >
      {iniciales || <School className="h-1/2 w-1/2" />}
    </span>
  )
}
