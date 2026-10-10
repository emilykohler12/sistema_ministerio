import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/shared/components/ui/Button'
import { Dialog } from '@/shared/components/ui/Dialog'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'

// Nombre recortado y de 1 a 200 caracteres (varchar(200)); URL https de hasta 500 (CHECK y varchar(500) de la base).
const nombre = z
  .string()
  .trim()
  .min(1, 'Ingresá el nombre')
  .max(200, 'El nombre no puede superar los 200 caracteres')

const esquemaConUrl = z.object({
  nombre,
  url: z
    .string()
    .trim()
    .max(500, 'La URL no puede superar los 500 caracteres')
    .refine((v) => v.startsWith('https://') && v.length > 'https://'.length, 'Ingresá una URL que empiece con https://'),
})
// Un archivo solo se renombra: la URL no se valida ni se usa.
const esquemaSinUrl = z.object({ nombre, url: z.string() })

type Valores = z.infer<typeof esquemaConUrl>

interface DialogoRecursoProps {
  open: boolean
  onClose: () => void
  titulo: string
  /** Texto del botón de envío ("Agregar" o "Guardar"). */
  accion: string
  /** `true` para un enlace: se pide también la URL. */
  conUrl: boolean
  inicial?: Partial<Valores>
  /** Si lanza, el diálogo queda abierto y muestra `mensajeDeError`. */
  onSubmit: (valores: { nombre: string; url: string }) => Promise<void>
  mensajeDeError: (error: unknown) => string
}

export function DialogoRecurso({ open, onClose, titulo, ...resto }: DialogoRecursoProps) {
  // El formulario vive en un hijo: se monta al abrir y arranca siempre con los valores iniciales.
  return (
    <Dialog open={open} onClose={onClose} title={titulo}>
      <Formulario onClose={onClose} {...resto} />
    </Dialog>
  )
}

function Formulario({
  onClose,
  accion,
  conUrl,
  inicial,
  onSubmit,
  mensajeDeError,
}: Omit<DialogoRecursoProps, 'open' | 'titulo'>) {
  const idNombre = useId()
  const idUrl = useId()
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({
    resolver: zodResolver(conUrl ? esquemaConUrl : esquemaSinUrl),
    defaultValues: { nombre: inicial?.nombre ?? '', url: inicial?.url ?? '' },
  })

  async function enviar(valores: Valores) {
    setErrorEnvio(null)
    try {
      await onSubmit(valores)
      onClose()
    } catch (error) {
      setErrorEnvio(mensajeDeError(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="space-y-4">
      <div>
        <Label htmlFor={idNombre}>Nombre</Label>
        <Input id={idNombre} error={!!errors.nombre} {...register('nombre')} />
        <FieldError id={`${idNombre}-error`} message={errors.nombre?.message} />
      </div>
      {conUrl && (
        <div>
          <Label htmlFor={idUrl}>URL</Label>
          <Input id={idUrl} type="url" placeholder="https://" error={!!errors.url} {...register('url')} />
          <FieldError id={`${idUrl}-error`} message={errors.url?.message} />
        </div>
      )}
      {errorEnvio && <FieldError id={`${idNombre}-envio`} message={errorEnvio} />}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {accion}
        </Button>
      </div>
    </form>
  )
}
