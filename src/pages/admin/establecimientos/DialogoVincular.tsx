import { useState } from 'react'
import { MENSAJE_VINCULACION_INVALIDA, esVinculacionInvalida } from '@/features/establecimientos/errores'
import { filtrarEstablecimientos } from '@/features/establecimientos/filtrar'
import { useEstablecimientos } from '@/features/establecimientos/hooks/useEstablecimientos'
import { useVincular } from '@/features/establecimientos/hooks/useSinVincular'
import type { Establecimiento, GrupoSinVincular } from '@/features/establecimientos/types'
import { Buscador } from '@/shared/components/ui/Buscador'
import { Button } from '@/shared/components/ui/Button'
import { Dialog } from '@/shared/components/ui/Dialog'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { FieldError } from '@/shared/components/ui/FieldError'
import { TableSkeleton } from '@/shared/components/ui/Skeleton'

interface DialogoVincularProps {
  grupo: GrupoSinVincular
  onClose: () => void
  /** Se llama con la cantidad de registros vinculados (0 si otro admin ya lo había hecho). */
  onVinculado: (cantidad: number, establecimiento: Establecimiento) => void
}

/** Vincula un grupo a un establecimiento activo de su misma localidad. Se monta solo mientras está abierto. */
export function DialogoVincular({ grupo, onClose, onVinculado }: DialogoVincularProps) {
  const [busqueda, setBusqueda] = useState('')
  const [seleccionId, setSeleccionId] = useState<number | null>(null)
  const establecimientos = useEstablecimientos(grupo.localidad_id)
  const vincular = useVincular()

  // El admin ve también los inactivos: solo se ofrecen los activos, que son los que acepta la base (DA005).
  const activos = establecimientos.data?.filter((e) => e.activo) ?? []
  const visibles = filtrarEstablecimientos(activos, busqueda)
  // Solo cuenta lo que está a la vista: si la búsqueda oculta la elección, o la lista refrescada ya no la trae, se descarta.
  const elegido = visibles.find((e) => e.id === seleccionId) ?? null
  const ocupado = vincular.isPending

  function confirmar() {
    if (!elegido) return
    vincular.mutate(
      { localidadId: grupo.localidad_id, nombre: grupo.nombre, establecimientoId: elegido.id },
      { onSuccess: (cantidad) => onVinculado(cantidad, elegido) },
    )
  }

  return (
    <Dialog
      open
      // Mientras guarda no se cierra: el resultado llegaría a una pantalla que ya pasó a otra cosa.
      onClose={ocupado ? () => {} : onClose}
      title="Vincular institución"
      description={`Elegí a qué establecimiento de ${grupo.localidad} corresponde «${grupo.nombre}».`}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <Buscador
          value={busqueda}
          onChange={setBusqueda}
          etiqueta="Buscar establecimiento"
          placeholder="Buscar por nombre o CUE..."
        />

        {establecimientos.isPending && <TableSkeleton rows={3} />}
        {establecimientos.isError && <ErrorFallback onRetry={() => void establecimientos.refetch()} />}
        {establecimientos.isSuccess && activos.length === 0 && (
          <p className="text-sm text-gray-600">
            Esta localidad no tiene establecimientos activos. Cerrá este diálogo y usá «Crear establecimiento».
          </p>
        )}
        {establecimientos.isSuccess && activos.length > 0 && (
          <fieldset disabled={ocupado}>
            <legend className="mb-2 text-sm font-medium text-gray-700">Establecimientos de {grupo.localidad}</legend>
            {visibles.length === 0 ? (
              <p className="text-sm text-gray-600">Ningún establecimiento coincide con la búsqueda</p>
            ) : (
              <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {visibles.map((e) => (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="establecimiento"
                      value={e.id}
                      checked={seleccionId === e.id}
                      onChange={() => setSeleccionId(e.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-gray-800">{e.nombre}</span>
                      {e.cue && <span className="ml-2 text-gray-500">CUE {e.cue}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {vincular.isError && (
          <FieldError
            id="vincular-error"
            message={
              esVinculacionInvalida(vincular.error)
                ? MENSAJE_VINCULACION_INVALIDA
                : 'No pudimos vincular la institución. Probá de nuevo.'
            }
          />
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" disabled={ocupado} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={elegido === null || ocupado} onClick={confirmar}>
            {ocupado ? 'Vinculando...' : 'Vincular'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
