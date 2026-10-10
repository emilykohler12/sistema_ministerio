import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams } from 'react-router-dom'
import { mensajeDeError } from '@/features/talleres/errores'
import { useCategoriaDeRuta } from '@/features/talleres/hooks/useCategoriaDeRuta'
import { useEtiquetas } from '@/features/etiquetas/hooks/useEtiquetas'
import { useGuardarTaller, useTaller } from '@/features/talleres/hooks/useTalleres'
import {
  DESTINATARIOS,
  ETIQUETA_ESTADO,
  NIVELES,
  type Categoria,
  type NivelEducativo,
  type Taller,
  type TallerGuardado,
} from '@/features/talleres/types'
import { Constants } from '@/shared/types/database'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Label } from '@/shared/components/ui/Label'
import { Input } from '@/shared/components/ui/Input'
import { Select } from '@/shared/components/ui/Select'
import { Textarea } from '@/shared/components/ui/Textarea'
import { FieldError } from '@/shared/components/ui/FieldError'
import { ToggleGroup } from '@/shared/components/ui/ToggleGroup'
import { TagInput } from '@/shared/components/ui/TagInput'
import { Button } from '@/shared/components/ui/Button'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { NoEncontrado } from '@/shared/components/ui/NoEncontrado'
import { idDeRuta } from '@/shared/lib/rutas'

// Las reglas del criterio 1: nombre sin espacios en los bordes (hasta varchar(200)), descripción obligatoria,
// al menos un destinatario y de 0 a 20 etiquetas de 1 a 100 caracteres.
const schema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Ingresá el nombre del taller')
    .max(200, 'El nombre no puede superar los 200 caracteres'),
  descripcion: z.string().trim().min(1, 'Ingresá una breve descripción'),
  estado: z.enum(Constants.public.Enums.estado_taller),
  destinatarios: z.array(z.number()).min(1, 'Elegí al menos un destinatario'),
  etiquetas: z
    .array(z.string())
    .max(20, 'Podés cargar hasta 20 etiquetas')
    .refine((tags) => tags.every((t) => t.trim().length >= 1 && t.length <= 100), {
      message: 'Cada etiqueta debe tener entre 1 y 100 caracteres',
    }),
})

type FormValues = z.infer<typeof schema>

const MENSAJE_GENERICO = 'No pudimos guardar el taller. Probá de nuevo.'

export function TallerFormPage() {
  const params = useParams<{ nivelId: string; categoriaId: string; tallerId?: string }>()
  const nivel = NIVELES.find((n) => n.id === idDeRuta(params.nivelId))
  const esEdicion = params.tallerId !== undefined
  const categoriaRuta = useCategoriaDeRuta(params.nivelId, params.categoriaId)
  const tallerRuta = useTaller(esEdicion ? idDeRuta(params.tallerId) : null)

  if (!nivel) return <NoEncontrado titulo="Nivel no encontrado" volverA="/admin/talleres" />
  if (categoriaRuta.estado === 'cargando') return <CardSkeleton />
  if (categoriaRuta.estado === 'error') return <ErrorFallback onRetry={categoriaRuta.reintentar} />
  if (categoriaRuta.estado === 'no-encontrada') {
    return <NoEncontrado titulo="Categoría no encontrada" volverA={`/admin/talleres/${nivel.id}`} />
  }
  const categoria = categoriaRuta.categoria

  if (!esEdicion) return <Formulario nivel={nivel} categoria={categoria} />

  // Sin el taller cargado no se muestra el formulario: guardar vacío pisaría sus datos.
  const volverA = `/admin/talleres/${nivel.id}/${categoria.id}`
  if (idDeRuta(params.tallerId) === null) return <NoEncontrado titulo="Taller no encontrado" volverA={volverA} />
  if (tallerRuta.isError) return <ErrorFallback onRetry={() => void tallerRuta.refetch()} />
  if (tallerRuta.data === undefined) return <CardSkeleton />
  if (tallerRuta.data === null || tallerRuta.data.categoria_id !== categoria.id) {
    return <NoEncontrado titulo="Taller no encontrado" volverA={volverA} />
  }
  return <Formulario nivel={nivel} categoria={categoria} taller={tallerRuta.data} />
}

function Formulario({
  nivel,
  categoria,
  taller,
}: {
  nivel: NivelEducativo
  categoria: Categoria
  taller?: Taller
}) {
  const navigate = useNavigate()
  const guardar = useGuardarTaller()
  const etiquetasSugeridas = useEtiquetas()
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const volver = `/admin/talleres/${nivel.id}/${categoria.id}`

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: taller?.nombre ?? '',
      descripcion: taller?.descripcion ?? '',
      estado: taller?.estado ?? 'BORRADOR',
      destinatarios: taller?.destinatario.map((d) => d.id) ?? [],
      etiquetas: taller?.etiqueta.map((e) => e.nombre) ?? [],
    },
  })

  const destinatarios = watch('destinatarios')

  function alternarDestinatario(id: number) {
    const siguientes = destinatarios.includes(id) ? destinatarios.filter((d) => d !== id) : [...destinatarios, id]
    setValue('destinatarios', siguientes, { shouldValidate: true })
  }

  async function onSubmit(valores: FormValues) {
    setErrorGuardado(null)
    const datos: TallerGuardado = {
      ...(taller ? { p_id: taller.id } : {}),
      p_categoria_id: categoria.id,
      p_nombre: valores.nombre,
      p_descripcion: valores.descripcion,
      p_estado: valores.estado,
      p_destinatarios: [...valores.destinatarios].sort((a, b) => a - b),
      p_etiquetas: valores.etiquetas,
    }
    try {
      const id = await guardar.mutateAsync(datos)
      // Tras el alta se abre la pantalla de recursos del taller nuevo; la edición vuelve a la lista.
      navigate(taller ? volver : `${volver}/${id}/recursos`)
    } catch (error) {
      setErrorGuardado(mensajeDeError(error, MENSAJE_GENERICO))
    }
  }

  const titulo = taller ? 'Editar taller' : 'Nuevo Taller'

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Talleres', to: '/admin/talleres' },
          { label: nivel.nombre, to: `/admin/talleres/${nivel.id}` },
          { label: categoria.nombre, to: volver },
          { label: taller ? 'Editar taller' : 'Nuevo taller' },
        ]}
      />

      <h1 className="text-2xl font-bold text-primary-800">{titulo}</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-5">
        <div>
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" placeholder="Nombre del taller" error={!!errors.nombre} {...register('nombre')} />
          <FieldError id="nombre-error" message={errors.nombre?.message} />
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción</Label>
          <Textarea
            id="descripcion"
            rows={3}
            placeholder="Breve descripción..."
            error={!!errors.descripcion}
            {...register('descripcion')}
          />
          <FieldError id="descripcion-error" message={errors.descripcion?.message} />
        </div>

        <div>
          <Label htmlFor="estado">Estado</Label>
          <Select id="estado" {...register('estado')}>
            {Constants.public.Enums.estado_taller.map((estado) => (
              <option key={estado} value={estado}>
                {ETIQUETA_ESTADO[estado]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Destinado a</Label>
          <ToggleGroup
            name="Destinado a"
            multiple
            options={DESTINATARIOS.map((d) => ({ value: String(d.id), label: d.nombre }))}
            value={destinatarios.map(String)}
            onChange={(v) => alternarDestinatario(Number(v))}
          />
          <FieldError id="destinatarios-error" message={errors.destinatarios?.message} />
        </div>

        <div>
          <Label htmlFor="etiquetas">Etiquetas</Label>
          <TagInput
            value={watch('etiquetas')}
            onChange={(v) => setValue('etiquetas', v, { shouldValidate: true })}
            suggestions={etiquetasSugeridas}
            placeholder="Ej: lectura, evaluación"
          />
          <FieldError id="etiquetas-error" message={errors.etiquetas?.message ?? errors.etiquetas?.root?.message} />
        </div>

        {errorGuardado && <FieldError id="taller-error" message={errorGuardado} />}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(volver)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : taller ? 'Guardar cambios' : 'Crear taller'}
          </Button>
        </div>
      </form>
    </div>
  )
}
