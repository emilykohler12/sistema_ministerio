import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { useNormativa } from '@/features/normativas/hooks/useNormativas'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Label } from '@/shared/components/ui/Label'
import { Input } from '@/shared/components/ui/Input'
import { Textarea } from '@/shared/components/ui/Textarea'
import { FieldError } from '@/shared/components/ui/FieldError'
import { TagInput } from '@/shared/components/ui/TagInput'
import { FileDropzone } from '@/shared/components/ui/FileDropzone'
import { Button } from '@/shared/components/ui/Button'

const schema = z.object({
  titulo: z.string().min(2, 'Ingresá el título de la normativa'),
  descripcion: z.string().optional(),
  etiquetas: z.array(z.string()),
  numero: z.string().min(1, 'Ingresá el número'),
  anio: z.string().regex(/^\d{4}$/, 'Ingresá un año de 4 dígitos'),
})

type FormValues = z.infer<typeof schema>

export function NormativaFormPage() {
  const [searchParams] = useSearchParams()
  const editarId = searchParams.get('editar') ?? undefined
  const normativaExistente = useNormativa(editarId)
  const navigate = useNavigate()
  const { usuario } = useAuth()
  const [archivo, setArchivo] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: normativaExistente.data
      ? {
          titulo: normativaExistente.data.titulo,
          descripcion: normativaExistente.data.descripcion,
          etiquetas: normativaExistente.data.etiquetas,
          numero: normativaExistente.data.numero,
          anio: normativaExistente.data.anio,
        }
      : {
          titulo: '',
          descripcion: '',
          etiquetas: [],
          numero: '',
          anio: '',
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

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-5">
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
          <Label>Etiquetas</Label>
          <Controller
            control={control}
            name="etiquetas"
            render={({ field }) => (
              <TagInput
                value={field.value}
                onChange={field.onChange}
                placeholder="Escribí una palabra clave y presioná Enter"
              />
            )}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="numero">Número</Label>
            <Input id="numero" placeholder="Ej: 1234/24" error={!!errors.numero} {...register('numero')} />
            <FieldError id="numero-error" message={errors.numero?.message} />
          </div>
          <div>
            <Label htmlFor="anio">Año</Label>
            <Input
              id="anio"
              inputMode="numeric"
              maxLength={4}
              placeholder="Ej: 2024"
              error={!!errors.anio}
              {...register('anio')}
            />
            <FieldError id="anio-error" message={errors.anio?.message} />
          </div>
        </div>

        <div>
          <Label>Archivo</Label>
          <FileDropzone label="Arrastrá el PDF o" accept="application/pdf" files={archivo} onChange={setArchivo} />
        </div>

        <div>
          <Label htmlFor="responsable">Nombre del encargado de subir</Label>
          <Input id="responsable" value={usuario?.email ?? ''} disabled />
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
