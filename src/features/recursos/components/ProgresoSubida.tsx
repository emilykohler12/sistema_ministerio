import { formatearTamanio } from '../archivos'
import type { EstadoEnCurso } from '../hooks/useRecursos'
import { Button } from '@/shared/components/ui/Button'

type Props = {
  nombre: string
  /** Tamaño del archivo en bytes. */
  tamanio: number
  /** Entero de 0 a 100. */
  progreso: number
  estado: EstadoEnCurso
  onCancelar: () => void
}

/**
 * Fila de una subida en curso: barra con el nombre del archivo, MB enviados y «Cancelar». Con todos los bytes enviados
 * (progreso 100, «Finalizando…» o un reintento) ya no se puede cancelar: el servidor puede haber completado el objeto. No anuncia nada por sí
 * misma: los avisos los da el `role="status"` de la pantalla, para no leer cada porcentaje.
 */
export function ProgresoSubida({ nombre, tamanio, progreso, estado, onCancelar }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-medium text-gray-800">{nombre}</span>
        {progreso < 100 && (
          <Button size="sm" variant="ghost" aria-label={`Cancelar la subida de ${nombre}`} onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
      <progress max={100} value={progreso} aria-label={nombre} className="h-2 w-full accent-primary-600" />
      <p className="text-xs text-gray-600">
        {estado === 'esperando'
          ? 'En espera'
          : `${formatearTamanio(Math.round((tamanio * progreso) / 100))} de ${formatearTamanio(tamanio)} (${progreso} %)`}
      </p>
      {estado === 'reintentando' && <p className="text-xs font-medium text-amber-700">Sin conexión, reintentando…</p>}
      {estado === 'finalizando' && <p className="text-xs font-medium text-gray-600">Finalizando…</p>}
    </div>
  )
}
