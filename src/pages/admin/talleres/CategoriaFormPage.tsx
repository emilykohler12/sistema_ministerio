import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { NIVELES_FILTRO, NIVEL_VALUES, type Nivel } from '@/features/talleres/types'
import { useCategoria } from '@/features/talleres/hooks/useCategorias'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Label } from '@/shared/components/ui/Label'
import { Input } from '@/shared/components/ui/Input'
import { Textarea } from '@/shared/components/ui/Textarea'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Button } from '@/shared/components/ui/Button'

const schema = z.object({
  nombre: z.string().min(2, 'Ingresá el nombre de la categoría'),
  nivel: z.enum(NIVEL_VALUES),
  descripcion: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function CategoriaFormPage() {
  const { nivel } = useParams<{ nivel: Nivel }>()
  const [searchParams] = useSearchParams()
  const editarId = searchParams.get('editar') ?? undefined
  const categoriaExistente = useCategoria(editarId)
  const navigate = useNavigate()

  const nivelInfo = NIVELES_FILTRO.find((n) => n.value === nivel)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: categoriaExistente.data
      ? {
          nombre: categoriaExistente.data.nombre,
          nivel: categoriaExistente.data.nivel,
          descripcion: categoriaExistente.data.descripcion ?? '',
        }
      : { nombre: '', nivel: nivel ?? 'inicial', descripcion: '' },
  })

  if (!nivelInfo) return <Navigate to="/admin/talleres" replace />

  async function onSubmit() {
    await new Promise((r) => setTimeout(r, 500))
    reset()
    navigate(`/admin/talleres/${nivel}`)
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Talleres', to: '/admin/talleres' },
          { label: nivelInfo.label, to: `/admin/talleres/${nivel}` },
          { label: editarId ? 'Editar categoría' : 'Nueva categoría' },
        ]}
      />

      <h1 className="text-2xl font-bold text-primary-800">{editarId ? 'Editar categoría' : 'Nueva categoría'}</h1>

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

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(`/admin/talleres/${nivel}`)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : editarId ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </div>
      </form>
    </div>
  )
}
