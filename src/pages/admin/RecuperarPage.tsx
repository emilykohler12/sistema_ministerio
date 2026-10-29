import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { esquemaRecuperacion, type DatosRecuperacion } from '@/features/auth/esquema'
import { useSolicitarRecuperacion } from '@/features/auth/hooks/useSolicitarRecuperacion'
import { Button } from '@/shared/components/ui/Button'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'

export function RecuperarPage() {
  const [resultado, setResultado] = useState<'ok' | 'red' | null>(null)
  const avisoRef = useRef<HTMLParagraphElement>(null)
  const solicitar = useSolicitarRecuperacion()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosRecuperacion>({ resolver: zodResolver(esquemaRecuperacion) })

  useEffect(() => {
    if (resultado) avisoRef.current?.focus()
  }, [resultado])

  async function onSubmit({ correo }: DatosRecuperacion) {
    // Se limpia antes para que un segundo fallo igual vuelva a montar el aviso y reciba el foco.
    setResultado(null)
    setResultado(await solicitar.mutateAsync(correo))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-900 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary-800 text-lg font-bold text-white">
            .se
          </span>
          <h1 className="text-xl font-bold text-primary-800">Recuperar contraseña</h1>
          <p className="mt-2 text-sm text-gray-600">
            Ingresá tu correo y te enviamos un enlace para elegir una contraseña nueva.
          </p>
        </div>

        {resultado === 'ok' && (
          <p
            ref={avisoRef}
            role="status"
            tabIndex={-1}
            className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            Si el correo corresponde a una cuenta, te enviamos un enlace. Si no llega en unos
            minutos, revisá spam o volvé a pedirlo más tarde.
          </p>
        )}
        {resultado === 'red' && (
          <p
            ref={avisoRef}
            role="alert"
            tabIndex={-1}
            className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            No se pudo enviar el enlace. Revisá tu conexión e intentá de nuevo.
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="correo">Correo electrónico</Label>
            <Input
              id="correo"
              type="email"
              autoComplete="username"
              placeholder="Ingrese su correo"
              error={!!errors.correo}
              aria-describedby={errors.correo ? 'correo-error' : undefined}
              {...register('correo')}
            />
            <FieldError id="correo-error" message={errors.correo?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={solicitar.isPending}>
            {solicitar.isPending ? 'Enviando...' : 'Enviar enlace'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link to="/admin/login" className="text-primary-700 underline hover:text-primary-800">
            Volver a ingresar
          </Link>
        </p>
      </div>
    </div>
  )
}
