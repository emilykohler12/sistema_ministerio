import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import {
  MENSAJE_CUE_DUPLICADO,
  MENSAJE_NOMBRE_DUPLICADO,
  esCueDuplicado,
  esNombreDuplicado,
} from '@/features/establecimientos/errores'
import { esquemaEstablecimiento } from '@/features/establecimientos/esquema'
import { useCrearEstablecimiento } from '@/features/establecimientos/hooks/useEstablecimientos'
import { useVincular } from '@/features/establecimientos/hooks/useSinVincular'
import type { Establecimiento, GrupoSinVincular } from '@/features/establecimientos/types'
import { Button } from '@/shared/components/ui/Button'
import { Dialog } from '@/shared/components/ui/Dialog'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'

// La localidad es la del grupo y no se edita.
const esquema = esquemaEstablecimiento.omit({ localidad_id: true })
type FormInput = z.input<typeof esquema>
type FormOutput = z.output<typeof esquema>

const GUIA_NOMBRE_DUPLICADO =
  'Cerrá este diálogo y usá «Vincular» para elegirlo; si está dado de baja, podés reactivarlo desde Establecimientos.'

interface DialogoCrearProps {
  grupo: GrupoSinVincular
  onClose: () => void
  onVinculado: (cantidad: number, establecimiento: Establecimiento) => void
}

/**
 * Crea el establecimiento y vincula el grupo en dos llamadas. Todo el estado sale de las mutaciones: el establecimiento creado
 * es `crear.data`; si la vinculación falla queda un establecimiento válido y "Reintentar" solo vincula, sin volver a crear.
 */
export function DialogoCrear({ grupo, onClose, onVinculado }: DialogoCrearProps) {
  const crear = useCrearEstablecimiento()
  const vincular = useVincular()
  const creado = crear.data

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: grupo.nombre, cue: '' },
  })

  function vincularCon(establecimiento: Establecimiento) {
    vincular.mutate(
      { localidadId: grupo.localidad_id, nombre: grupo.nombre, establecimientoId: establecimiento.id },
      { onSuccess: (cantidad) => onVinculado(cantidad, establecimiento) },
    )
  }

  function onSubmit(valores: FormOutput) {
    crear.mutate({ ...valores, localidad_id: grupo.localidad_id }, { onSuccess: vincularCon })
  }

  // Con el establecimiento creado y sin error de vinculación, la segunda llamada está en curso (o por empezar).
  const ocupado = crear.isPending || (creado !== undefined && !vincular.isError)
  const nombreDuplicado = esNombreDuplicado(crear.error)
  const cueDuplicado = esCueDuplicado(crear.error)
  const errorNombre =
    errors.nombre?.message ?? (nombreDuplicado ? `${MENSAJE_NOMBRE_DUPLICADO}. ${GUIA_NOMBRE_DUPLICADO}` : undefined)
  const errorCue = errors.cue?.message ?? (cueDuplicado ? MENSAJE_CUE_DUPLICADO : undefined)

  return (
    <Dialog
      open
      // Mientras guarda no se cierra: el resultado llegaría a una pantalla que ya pasó a otra cosa.
      onClose={ocupado ? () => {} : onClose}
      title="Crear establecimiento"
      description={`Se crea en el padrón y se vincula a «${grupo.nombre}».`}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <Label htmlFor="crear-nombre">Nombre del establecimiento</Label>
          <Input
            id="crear-nombre"
            readOnly={creado !== undefined}
            error={!!errorNombre}
            aria-describedby={errorNombre ? 'crear-nombre-error' : undefined}
            {...register('nombre')}
          />
          <FieldError id="crear-nombre-error" message={errorNombre} />
        </div>

        <div>
          <Label htmlFor="crear-cue">CUE (opcional)</Label>
          <Input
            id="crear-cue"
            inputMode="numeric"
            placeholder="Solo dígitos"
            readOnly={creado !== undefined}
            error={!!errorCue}
            aria-describedby={errorCue ? 'crear-cue-error' : undefined}
            {...register('cue')}
          />
          <FieldError id="crear-cue-error" message={errorCue} />
        </div>

        <p className="text-sm text-gray-600">
          Localidad: <span className="font-medium text-gray-800">{grupo.localidad}</span>
        </p>

        {crear.isError && !nombreDuplicado && !cueDuplicado && (
          <FieldError id="crear-error" message="No pudimos crear el establecimiento. Probá de nuevo." />
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" disabled={ocupado} onClick={onClose}>
            Cancelar
          </Button>
          {creado === undefined ? (
            <Button type="submit" disabled={ocupado}>
              {ocupado ? 'Guardando...' : 'Crear y vincular'}
            </Button>
          ) : (
            !vincular.isError && (
              <Button type="button" disabled>
                Vinculando...
              </Button>
            )
          )}
        </div>
      </form>
      {/* Fuera del formulario: su botón "Reintentar" no debe enviarlo. Es el único camino para reintentar la vinculación. */}
      {creado !== undefined && vincular.isError && (
        <div className="mt-4">
          <ErrorFallback
            message={`Se creó «${creado.nombre}», pero no pudimos vincular las descargas. Probá de nuevo.`}
            onRetry={() => vincularCon(creado)}
          />
        </div>
      )}
    </Dialog>
  )
}
