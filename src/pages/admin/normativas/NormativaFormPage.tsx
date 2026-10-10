import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEtiquetas } from '@/features/etiquetas/hooks/useEtiquetas'
import { validarPdf } from '@/features/normativas/archivos'
import { mensajeDeErrorNormativa } from '@/features/normativas/errores'
import { useGuardarNormativa, useNormativa } from '@/features/normativas/hooks/useNormativas'
import type { Normativa } from '@/features/normativas/types'

import { NoEncontrado } from '@/shared/components/ui/NoEncontrado'
import { idDeRuta } from '@/shared/lib/rutas'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Label } from '@/shared/components/ui/Label'
import { Input } from '@/shared/components/ui/Input'
import { Textarea } from '@/shared/components/ui/Textarea'
import { FieldError } from '@/shared/components/ui/FieldError'
import { TagInput } from '@/shared/components/ui/TagInput'
import { FileDropzone } from '@/shared/components/ui/FileDropzone'
import { Button } from '@/shared/components/ui/Button'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'

const LISTA = '/admin/normativas'

// Los mismos límites que la base: título hasta 200, número hasta 50 y año entre 1900 y 2100. El PDF es obligatorio
// solo en el alta; en la edición, sin archivo se conserva el que está en la base.
function crearSchema(esAlta: boolean) {
  return z.object({
    titulo: z
      .string()
      .trim()
      .min(1, 'Ingresá el título de la normativa')
      .max(200, 'El título no puede superar los 200 caracteres'),
    descripcion: z.string(),
    etiquetas: z.array(z.string()),
    numero: z
      .string()
      .trim()
      .min(1, 'Ingresá el número')
      .max(50, 'El número no puede superar los 50 caracteres'),
    anio: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Ingresá un año de 4 dígitos')
      .refine((v) => Number(v) >= 1900 && Number(v) <= 2100, 'El año debe estar entre 1900 y 2100'),
    archivo: z.custom<File | null>().superRefine((file, ctx) => {
      const motivo = file ? validarPdf(file) : esAlta ? 'Elegí el PDF de la normativa' : null
      if (motivo) ctx.addIssue({ code: 'custom', message: motivo })
    }),
  })
}

type FormValues = z.infer<ReturnType<typeof crearSchema>>

const NORMATIVA_NO_ENCONTRADA = 'Normativa no encontrada'

export function NormativaFormPage() {
  const [searchParams] = useSearchParams()
  const editar = searchParams.get('editar')
  const esEdicion = editar !== null
  const id = esEdicion ? idDeRuta(editar) : null
  const normativa = useNormativa(id)

  if (!esEdicion) return <Formulario />

  // Sin la normativa cargada no se muestra el formulario: guardar vacío pisaría sus datos.
  if (id === null) return <NoEncontrado titulo={NORMATIVA_NO_ENCONTRADA} volverA={LISTA} />
  if (normativa.isError) return <ErrorFallback onRetry={() => void normativa.refetch()} />
  if (normativa.data === undefined) return <CardSkeleton />
  if (normativa.data === null) return <NoEncontrado titulo={NORMATIVA_NO_ENCONTRADA} volverA={LISTA} />
  return <Formulario normativa={normativa.data} />
}

function Formulario({ normativa }: { normativa?: Normativa }) {
  const navigate = useNavigate()
  const guardar = useGuardarNormativa()
  const etiquetasSugeridas = useEtiquetas()
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const schema = useMemo(() => crearSchema(!normativa), [normativa])

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      titulo: normativa?.titulo ?? '',
      descripcion: normativa?.descripcion ?? '',
      etiquetas: normativa?.etiqueta.map((e) => e.nombre) ?? [],
      numero: normativa?.numero ?? '',
      anio: normativa ? String(normativa.anio) : '',
      archivo: null,
    },
  })

  async function onSubmit(valores: FormValues) {
    setErrorGuardado(null)
    try {
      await guardar.mutateAsync({
        id: normativa?.id,
        datos: {
          titulo: valores.titulo,
          descripcion: valores.descripcion.trim() === '' ? null : valores.descripcion.trim(),
          numero: valores.numero,
          anio: Number(valores.anio),
          etiquetas: valores.etiquetas,
        },
        archivo: valores.archivo ?? undefined,
      })
      navigate(LISTA)
    } catch (error) {
      setErrorGuardado(mensajeDeErrorNormativa(error))
    }
  }

  const titulo = normativa ? 'Editar normativa' : 'Nueva Normativa'

  return (
    <div>
      <Breadcrumb items={[{ label: 'Normativas', to: LISTA }, { label: titulo }]} />

      <h1 className="text-2xl font-bold text-primary-800">{titulo}</h1>

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
                suggestions={etiquetasSugeridas}
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
          <Label htmlFor="archivo">Archivo</Label>
          {normativa && (
            <p className="mb-2 text-sm text-gray-600">
              <a
                href={normativa.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary-600 hover:underline"
              >
                Ver archivo actual
              </a>
              . Si no elegís otro, se conserva.
            </p>
          )}
          <Controller
            control={control}
            name="archivo"
            render={({ field }) => (
              <FileDropzone
                id="archivo"
                invalid={!!errors.archivo}
                describedBy={errors.archivo ? 'archivo-error' : undefined}
                label="Arrastrá el PDF o"
                hint="Solo PDF, hasta 20 MB"
                accept="application/pdf"
                files={field.value ? [field.value.name] : []}
                onFiles={(elegidos) => field.onChange(elegidos[0] ?? null)}
                onChange={(nombres) => {
                  if (nombres.length === 0) field.onChange(null)
                }}
              />
            )}
          />
          <FieldError id="archivo-error" message={errors.archivo?.message} />
        </div>

        {errorGuardado && <FieldError id="normativa-error" message={errorGuardado} />}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(LISTA)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
