import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { useConfiguracion, useGuardarConfiguracion } from '@/features/configuracion/hooks/useConfiguracion'
import { getInitials } from '@/shared/lib/utils'
import { Label } from '@/shared/components/ui/Label'
import { Input } from '@/shared/components/ui/Input'
import { Textarea } from '@/shared/components/ui/Textarea'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { Skeleton } from '@/shared/components/ui/Skeleton'

const schema = z.object({
  nombre: z.string().trim().min(1, 'Ingresá el nombre de la institución'),
  telefono: z.string(),
  correo: z.union([z.literal(''), z.email('Ingresá un correo válido')]),
  direccion: z.string(),
  facebook: z.string(),
  instagram: z.string(),
  quienes_somos: z.string(),
  mision: z.string(),
  vision: z.string(),
})

type FormValues = z.infer<typeof schema>

export function ConfiguracionPage() {
  const { data, isLoading, refetch } = useConfiguracion()
  const guardar = useGuardarConfiguracion()
  const [guardado, setGuardado] = useState(false)

  // `values` recarga el formulario cuando cambia la fila (también tras guardar). El schema descarta
  // las claves que no declara, así que id, logo_ruta y updated_at nunca llegan a guardarConfiguracion.
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), values: data })

  const nombre = watch('nombre')

  async function onSubmit(values: FormValues) {
    setGuardado(false)
    try {
      await guardar.mutateAsync(values)
    } catch {
      return // el error se muestra desde guardar.isError
    }
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Sin fila no se muestra el formulario: guardarlo vacío pisaría la configuración real.
  if (!data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm font-medium text-red-600">
          No se pudo cargar la configuración.
        </p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-800">Configuración</h1>
      <p className="mt-1 text-sm text-gray-500">Gestioná la información institucional y las preferencias del sitio.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-semibold text-primary-700">Datos institucionales</h2>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-col items-center gap-2">
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-800 text-lg font-bold text-white"
                aria-hidden="true"
              >
                {getInitials(nombre ?? '')}
              </span>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <Label htmlFor="nombre">Nombre de la institución</Label>
                <Input id="nombre" error={!!errors.nombre} {...register('nombre')} />
                <FieldError id="nombre-error" message={errors.nombre?.message} />
              </div>
              <div>
                <Label htmlFor="telefono">Teléfono</Label>
                <Input id="telefono" error={!!errors.telefono} {...register('telefono')} />
                <FieldError id="telefono-error" message={errors.telefono?.message} />
              </div>
              <div>
                <Label htmlFor="correo">Correo de contacto</Label>
                <Input id="correo" type="email" error={!!errors.correo} {...register('correo')} />
                <FieldError id="correo-error" message={errors.correo?.message} />
              </div>
              <div>
                <Label htmlFor="direccion">Dirección</Label>
                <Input id="direccion" error={!!errors.direccion} {...register('direccion')} />
                <FieldError id="direccion-error" message={errors.direccion?.message} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-primary-700">Redes sociales</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="facebook">Facebook</Label>
              <Input id="facebook" placeholder="https://facebook.com/..." {...register('facebook')} />
            </div>
            <div>
              <Label htmlFor="instagram">Instagram</Label>
              <Input id="instagram" placeholder="https://instagram.com/..." {...register('instagram')} />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="text-base font-semibold text-primary-700">Quienes somos</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="quienes_somos">Quiénes somos</Label>
              <Textarea id="quienes_somos" rows={2} {...register('quienes_somos')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="mision">Misión</Label>
                <Textarea id="mision" rows={3} {...register('mision')} />
              </div>
              <div>
                <Label htmlFor="vision">Visión</Label>
                <Textarea id="vision" rows={3} {...register('vision')} />
              </div>
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3 lg:col-span-3">
          {guardar.isError && (
            <p role="alert" className="text-sm font-medium text-red-600">
              No se pudieron guardar los cambios. Intentá de nuevo.
            </p>
          )}
          {guardado && <span className="text-sm font-medium text-green-600">Cambios guardados</span>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </div>
  )
}
