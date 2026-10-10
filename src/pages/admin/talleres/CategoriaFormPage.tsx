import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { NIVELES, type Categoria, type NivelEducativo } from '@/features/talleres/types'
import { esNombreDuplicado } from '@/features/talleres/errores'
import { useCategoriaDeRuta } from '@/features/talleres/hooks/useCategoriaDeRuta'
import { useActualizarCategoria, useCrearCategoria } from '@/features/talleres/hooks/useCategorias'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Label } from '@/shared/components/ui/Label'
import { Input } from '@/shared/components/ui/Input'
import { Textarea } from '@/shared/components/ui/Textarea'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Button } from '@/shared/components/ui/Button'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { NoEncontrado } from '@/shared/components/ui/NoEncontrado'
import { idDeRuta } from '@/shared/lib/rutas'

// Igual que la base: nombre no vacío (sin espacios en los bordes) y de hasta varchar(150).
const schema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Ingresá el nombre de la categoría')
    .max(150, 'El nombre no puede superar los 150 caracteres'),
  descripcion: z.string(),
})

type FormValues = z.infer<typeof schema>

const MENSAJE_DUPLICADO = 'Ya existe una categoría con ese nombre en este nivel (puede estar dada de baja)'
const MENSAJE_GENERICO = 'No pudimos guardar la categoría. Probá de nuevo.'

export function CategoriaFormPage() {
  const { nivelId } = useParams<{ nivelId: string }>()
  const [searchParams] = useSearchParams()
  const nivel = NIVELES.find((n) => n.id === idDeRuta(nivelId))

  const editarParam = searchParams.get('editar')
  const esEdicion = editarParam !== null
  const categoria = useCategoriaDeRuta(nivelId, editarParam ?? undefined)

  if (!nivel) return <NoEncontrado titulo="Nivel no encontrado" volverA="/admin/talleres" />

  if (!esEdicion) return <Formulario nivel={nivel} />

  // Sin la categoría cargada no se muestra el formulario: guardar vacío pisaría la descripción.
  switch (categoria.estado) {
    case 'cargando':
      return <CardSkeleton />
    case 'error':
      return <ErrorFallback onRetry={categoria.reintentar} />
    case 'no-encontrada':
      return <NoEncontrado titulo="Categoría no encontrada" volverA={`/admin/talleres/${nivel.id}`} />
    case 'ok':
      return <Formulario nivel={nivel} categoria={categoria.categoria} />
  }
}

function Formulario({ nivel, categoria }: { nivel: NivelEducativo; categoria?: Categoria }) {
  const navigate = useNavigate()
  const crear = useCrearCategoria()
  const actualizar = useActualizarCategoria()
  const [errorGenerico, setErrorGenerico] = useState(false)
  const volver = `/admin/talleres/${nivel.id}`
  const titulo = categoria ? 'Editar categoría' : 'Nueva categoría'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nombre: categoria?.nombre ?? '', descripcion: categoria?.descripcion ?? '' },
  })

  async function onSubmit(valores: FormValues) {
    setErrorGenerico(false)
    try {
      if (categoria) {
        await actualizar.mutateAsync({ id: categoria.id, cambios: valores })
      } else {
        await crear.mutateAsync({ nivel_id: nivel.id, ...valores })
      }
      navigate(volver)
    } catch (error) {
      if (esNombreDuplicado(error)) setError('nombre', { message: MENSAJE_DUPLICADO })
      else setErrorGenerico(true)
    }
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Talleres', to: '/admin/talleres' },
          { label: nivel.nombre, to: volver },
          { label: titulo },
        ]}
      />

      <h1 className="text-2xl font-bold text-primary-800">{titulo}</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-5">
        <div>
          <Label htmlFor="nombre">Nombre de la categoría</Label>
          <Input id="nombre" placeholder="Ej: Salud mental" error={!!errors.nombre} {...register('nombre')} />
          <FieldError id="nombre-error" message={errors.nombre?.message} />
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción (opcional)</Label>
          <Textarea
            id="descripcion"
            rows={3}
            placeholder="Breve descripción del eje temático..."
            {...register('descripcion')}
          />
        </div>

        {errorGenerico && <FieldError id="categoria-error" message={MENSAJE_GENERICO} />}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(volver)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : categoria ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </div>
      </form>
    </div>
  )
}
