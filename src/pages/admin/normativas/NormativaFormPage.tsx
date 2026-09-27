import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { useNormativa } from '@/features/normativas/hooks/useNormativas'
import { TIPOS_NORMATIVA } from '@/features/normativas/types'
import { NIVELES, type Nivel } from '@/features/talleres/types'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Label } from '@/shared/components/ui/Label'
import { Input } from '@/shared/components/ui/Input'
import { Textarea } from '@/shared/components/ui/Textarea'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Select } from '@/shared/components/ui/Select'
import { ToggleGroup } from '@/shared/components/ui/ToggleGroup'
import { FileDropzone } from '@/shared/components/ui/FileDropzone'
import { Button } from '@/shared/components/ui/Button'

const schema = z.object({
  titulo: z.string().min(2, 'Ingresá el título de la normativa'),
  descripcion: z.string().optional(),
  tipo: z.string().min(1, 'Seleccioná un tipo'),
  numero: z.string().min(1, 'Ingresá el número'),
  fecha: z.string().min(1, 'Ingresá una fecha'),
  nivel: z.enum(['inicial', 'primario', 'secundario', 'terciario', 'todos']),
})

type FormValues = z.infer<typeof schema>

export function NormativaFormPage() {
  const [searchParams] = useSearchParams()
  const editarId = searchParams.get('editar') ?? undefined
  const normativaExistente = useNormativa(editarId)
  const navigate = useNavigate()
  const { responsable } = useAuth()
  const [archivo, setArchivo] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: normativaExistente.data
      ? {
          titulo: normativaExistente.data.titulo,
          descripcion: normativaExistente.data.descripcion,
          tipo: normativaExistente.data.tipo,
          numero: normativaExistente.data.numero,
          fecha: normativaExistente.data.fecha,
          nivel: normativaExistente.data.nivel,
        }
      : {
          titulo: '',
          descripcion: '',
          tipo: '',
          numero: '',
          fecha: '',
          nivel: 'inicial' as Nivel,
        },
  })

  async function onSubmit() {
    await new Promise((r) => setTimeout(r, 500))
    reset()
    navigate('/admin/normativas')
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Normativas', to: '/admin/normativas' },
          { label: editarId ? 'Editar normativa' : 'Nueva Normativa' },
        ]}
      />

      <h1 className="text-2xl font-bold text-primary-800">{editarId ? 'Editar normativa' : 'Nueva Normativa'}</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 max-w-2xl space-y-5">
        <div>
          <Label htmlFor="titulo">Título</Label>
          <Input id="titulo" placeholder="Nombre de la normativa" error={!!errors.titulo} {...register('titulo')} />
          <FieldError id="titulo-error" message={errors.titulo?.message} />
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción</Label>
          <Textarea
            id="descripcion"
            rows={3}
            placeholder="Ingrese una breve descripción de la normativa"
            {...register('descripcion')}
          />
        </div>

        <div>
          <Label htmlFor="tipo">Tipo de normativa</Label>
          <Select id="tipo" error={!!errors.tipo} {...register('tipo')}>
            <option value="">Seleccione un tipo</option>
            {TIPOS_NORMATIVA.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <FieldError id="tipo-error" message={errors.tipo?.message} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="numero">Número</Label>
            <Input id="numero" placeholder="Ej: 1234/24" error={!!errors.numero} {...register('numero')} />
            <FieldError id="numero-error" message={errors.numero?.message} />
          </div>
          <div>
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" error={!!errors.fecha} {...register('fecha')} />
            <FieldError id="fecha-error" message={errors.fecha?.message} />
          </div>
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
          <Label>Archivo</Label>
          <FileDropzone label="Arrastrá el PDF o" accept="application/pdf" files={archivo} onChange={setArchivo} />
        </div>

        <div>
          <Label htmlFor="responsable">Nombre del encargado de subir</Label>
          <Input id="responsable" value={responsable ?? ''} disabled />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/normativas')}>
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
