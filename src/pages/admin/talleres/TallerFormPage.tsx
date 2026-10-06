import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useCategoria } from '@/features/talleres/hooks/useCategorias'
import { useEtiquetasSugeridas, useTaller } from '@/features/talleres/hooks/useTalleres'
import { DESTINATARIOS, NIVELES, NIVEL_VALUES, type Nivel, type Destinatario } from '@/features/talleres/types'
import { NIVELES_FILTRO } from '@/features/talleres/types'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Label } from '@/shared/components/ui/Label'
import { Input } from '@/shared/components/ui/Input'
import { Textarea } from '@/shared/components/ui/Textarea'
import { FieldError } from '@/shared/components/ui/FieldError'
import { ToggleGroup } from '@/shared/components/ui/ToggleGroup'
import { TagInput } from '@/shared/components/ui/TagInput'
import { FileDropzone } from '@/shared/components/ui/FileDropzone'
import { Button } from '@/shared/components/ui/Button'

const schema = z.object({
  titulo: z.string().min(2, 'Ingresá el título del taller'),
  descripcion: z.string().min(2, 'Ingresá una breve descripción'),
  nivel: z.enum(NIVEL_VALUES),
  destinatarios: z.array(z.string()).min(1, 'Elegí al menos un destinatario'),
  etiquetas: z.array(z.string()),
  fecha: z.string().min(1, 'Ingresá una fecha'),
})

type FormValues = z.infer<typeof schema>

export function TallerFormPage() {
  const { nivel, categoriaId, tallerId } = useParams<{ nivel: Nivel; categoriaId: string; tallerId?: string }>()
  const navigate = useNavigate()
  const { responsable } = useAuth()
  const categoria = useCategoria(categoriaId)
  const tallerExistente = useTaller(tallerId)
  const etiquetasSugeridas = useEtiquetasSugeridas()

  const nivelInfo = NIVELES_FILTRO.find((n) => n.value === nivel)
  const esEdicion = !!tallerId

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: tallerExistente.data
      ? {
          titulo: tallerExistente.data.titulo,
          descripcion: tallerExistente.data.descripcion,
          nivel: tallerExistente.data.nivel,
          destinatarios: tallerExistente.data.destinatarios,
          etiquetas: tallerExistente.data.etiquetas,
          fecha: tallerExistente.data.fecha,
        }
      : {
          titulo: '',
          descripcion: '',
          nivel: nivel ?? 'inicial',
          destinatarios: [],
          etiquetas: [],
          fecha: '',
        },
  })

  const [files, setFiles] = useState<string[]>([])

  useEffect(() => {
    if (tallerExistente.data) {
      setFiles(tallerExistente.data.recursos.map((r) => r.nombre))
    }
  }, [tallerExistente.data])

  if (!nivelInfo) return <Navigate to="/admin/talleres" replace />

  async function onSubmit() {
    await new Promise((r) => setTimeout(r, 500))
    reset()
    navigate(`/admin/talleres/${nivel}/${categoriaId}`)
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Talleres', to: '/admin/talleres' },
          { label: nivelInfo.label, to: `/admin/talleres/${nivel}` },
          { label: categoria.data?.nombre ?? '...', to: `/admin/talleres/${nivel}/${categoriaId}` },
          { label: esEdicion ? 'Editar taller' : 'Nuevo taller' },
        ]}
      />

      <h1 className="text-2xl font-bold text-primary-800">{esEdicion ? 'Editar taller' : 'Nuevo Taller'}</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-5">
        <div>
          <Label htmlFor="titulo">Título</Label>
          <Input id="titulo" placeholder="Nombre del taller" error={!!errors.titulo} {...register('titulo')} />
          <FieldError id="titulo-error" message={errors.titulo?.message} />
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
          <Label>Archivo</Label>
          <FileDropzone multiple files={files} onChange={setFiles} hint="Podés sumar varios: PDF, video o imagen" />
        </div>

        <div>
          <Label>Nivel</Label>
          <ToggleGroup
            name="Nivel"
            options={NIVELES.filter((n) => n.value !== 'todos').map((n) => ({ value: n.value, label: n.label }))}
            value={watch('nivel')}
            onChange={(v) => setValue('nivel', v, { shouldValidate: true })}
          />
        </div>

        <div>
          <Label>Destinado a</Label>
          <ToggleGroup
            name="Destinado a"
            multiple
            options={DESTINATARIOS}
            value={watch('destinatarios') as Destinatario[]}
            onChange={(v) => {
              const current = watch('destinatarios')
              const next = current.includes(v) ? current.filter((d) => d !== v) : [...current, v]
              setValue('destinatarios', next, { shouldValidate: true })
            }}
          />
          <FieldError id="destinatarios-error" message={errors.destinatarios?.message} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="etiquetas">Etiquetas</Label>
            <TagInput
              value={watch('etiquetas')}
              onChange={(v) => setValue('etiquetas', v)}
              suggestions={etiquetasSugeridas}
              placeholder="Ej: lectura, evaluación"
            />
          </div>
          <div>
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" error={!!errors.fecha} {...register('fecha')} />
            <FieldError id="fecha-error" message={errors.fecha?.message} />
          </div>
        </div>

        <div>
          <Label htmlFor="responsable">Nombre del encargado de subir</Label>
          <Input id="responsable" value={responsable ?? ''} disabled />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/admin/talleres/${nivel}/${categoriaId}`)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Publicando...' : 'Publicar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
