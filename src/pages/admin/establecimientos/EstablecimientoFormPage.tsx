import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { esCueDuplicado, esNombreDuplicado } from '@/features/establecimientos/errores'
import {
  useActualizarEstablecimiento,
  useCrearEstablecimiento,
  useEstablecimiento,
  useLocalidades,
} from '@/features/establecimientos/hooks/useEstablecimientos'
import type { Establecimiento, Localidad } from '@/features/establecimientos/types'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Button } from '@/shared/components/ui/Button'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { NoEncontrado } from '@/shared/components/ui/NoEncontrado'
import { Select } from '@/shared/components/ui/Select'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { idDeRuta } from '@/shared/lib/rutas'

// Espejo de la base: nombre no vacío (sin espacios en los bordes) de hasta varchar(200); CUE vacío -> null,
// solo dígitos y hasta varchar(20); localidad obligatoria.
const schema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Ingresá el nombre del establecimiento')
    .max(200, 'El nombre no puede superar los 200 caracteres'),
  cue: z
    .string()
    .trim()
    .max(20, 'El CUE no puede superar los 20 dígitos')
    .regex(/^[0-9]*$/, 'El CUE solo puede tener dígitos')
    .transform((valor) => (valor === '' ? null : valor)),
  localidad_id: z.string().min(1, 'Elegí una localidad').transform(Number),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const MENSAJE_NOMBRE_DUPLICADO =
  'Ya existe un establecimiento con ese nombre en esta localidad (puede estar dado de baja)'
const MENSAJE_CUE_DUPLICADO = 'Ya existe un establecimiento con ese CUE'
const MENSAJE_GENERICO = 'No pudimos guardar el establecimiento. Probá de nuevo.'

const LISTADO = '/admin/establecimientos'

export function EstablecimientoFormPage() {
  const { id } = useParams<{ id: string }>()
  const esEdicion = id !== undefined
  const idEstablecimiento = esEdicion ? idDeRuta(id) : null
  const localidades = useLocalidades()
  const establecimiento = useEstablecimiento(idEstablecimiento)

  if (esEdicion && idEstablecimiento === null) return <NoEncontradoEstablecimiento />

  // Sin los datos cargados no se muestra el formulario: el select no tendría opciones y guardar vacío pisaría datos.
  if (localidades.isError || (esEdicion && establecimiento.isError)) {
    return (
      <ErrorFallback
        onRetry={() => {
          if (localidades.isError) void localidades.refetch()
          if (establecimiento.isError) void establecimiento.refetch()
        }}
      />
    )
  }
  if (localidades.isPending || (esEdicion && establecimiento.isPending)) return <CardSkeleton />
  if (esEdicion && establecimiento.data === null) return <NoEncontradoEstablecimiento />

  return <Formulario localidades={localidades.data} establecimiento={establecimiento.data ?? undefined} />
}

function NoEncontradoEstablecimiento() {
  return <NoEncontrado titulo="Establecimiento no encontrado" volverA={LISTADO} />
}

function Formulario({
  localidades,
  establecimiento,
}: {
  localidades: Localidad[]
  establecimiento?: Establecimiento
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const crear = useCrearEstablecimiento()
  const actualizar = useActualizarEstablecimiento()
  const [errorGenerico, setErrorGenerico] = useState(false)
  const titulo = establecimiento ? 'Editar establecimiento' : 'Nuevo establecimiento'

  // En el alta, la localidad viene de ?localidad= (solo si existe); en la edición, la del establecimiento.
  const localidadInicial = establecimiento?.localidad_id ?? idDeRuta(searchParams.get('localidad'))
  const localidadValida = localidades.some((l) => l.id === localidadInicial) ? localidadInicial : null
  const volver = (localidadId: number | null) =>
    localidadId === null ? LISTADO : `${LISTADO}?localidad=${localidadId}`

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: establecimiento?.nombre ?? '',
      cue: establecimiento?.cue ?? '',
      localidad_id: localidadValida === null ? '' : String(localidadValida),
    },
  })

  async function onSubmit(valores: FormOutput) {
    setErrorGenerico(false)
    try {
      if (establecimiento) {
        await actualizar.mutateAsync({ id: establecimiento.id, cambios: valores })
      } else {
        await crear.mutateAsync(valores)
      }
      navigate(volver(valores.localidad_id))
    } catch (error) {
      if (esNombreDuplicado(error)) setError('nombre', { message: MENSAJE_NOMBRE_DUPLICADO })
      else if (esCueDuplicado(error)) setError('cue', { message: MENSAJE_CUE_DUPLICADO })
      else setErrorGenerico(true)
    }
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Establecimientos', to: volver(localidadValida) },
          { label: titulo },
        ]}
      />

      <h1 className="text-2xl font-bold text-primary-800">{titulo}</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-5">
        <div>
          <Label htmlFor="nombre">Nombre del establecimiento</Label>
          <Input
            id="nombre"
            placeholder="Ej: Escuela N.º 1 Domingo Faustino Sarmiento"
            error={!!errors.nombre}
            aria-describedby={errors.nombre ? 'nombre-error' : undefined}
            {...register('nombre')}
          />
          <FieldError id="nombre-error" message={errors.nombre?.message} />
        </div>

        <div>
          <Label htmlFor="cue">CUE (opcional)</Label>
          <Input
            id="cue"
            inputMode="numeric"
            placeholder="Solo dígitos"
            error={!!errors.cue}
            aria-describedby={errors.cue ? 'cue-error' : undefined}
            {...register('cue')}
          />
          <FieldError id="cue-error" message={errors.cue?.message} />
        </div>

        <div>
          <Label htmlFor="localidad_id">Localidad</Label>
          <Select
            id="localidad_id"
            error={!!errors.localidad_id}
            aria-describedby={errors.localidad_id ? 'localidad-error' : undefined}
            {...register('localidad_id')}
          >
            <option value="">Elegí una localidad</option>
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </Select>
          <FieldError id="localidad-error" message={errors.localidad_id?.message} />
        </div>

        {errorGenerico && <FieldError id="establecimiento-error" message={MENSAJE_GENERICO} />}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(volver(localidadValida))}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : establecimiento ? 'Guardar cambios' : 'Crear establecimiento'}
          </Button>
        </div>
      </form>
    </div>
  )
}
