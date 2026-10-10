import { botonClases } from '@/shared/components/ui/botonClases'
import { contarDescarga } from '../hooks/useNormativas'
import type { Normativa } from '../types'

/**
 * "Descargar": abre el PDF público en otra pestaña. El `onClick` (y `onAuxClick`, que cubre el botón del medio, que no
 * dispara `click`) cuenta la descarga sin esperar la respuesta ni cancelar la navegación, así que un contador caído
 * no interrumpe la apertura.
 */
export function EnlaceDescarga({ normativa }: { normativa: Pick<Normativa, 'id' | 'url' | 'titulo'> }) {
  return (
    <a
      href={normativa.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => contarDescarga(normativa.id)}
      onAuxClick={(e) => {
        if (e.button === 1) contarDescarga(normativa.id)
      }}
      aria-label={`Descargar ${normativa.titulo}`}
      className={botonClases('outline', 'sm')}
    >
      Descargar
    </a>
  )
}
