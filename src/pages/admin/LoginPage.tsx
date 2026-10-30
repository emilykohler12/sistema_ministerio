import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth, type ErrorInicioSesion } from '@/features/auth/AuthContext'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { InputPassword } from '@/shared/components/ui/InputPassword'
import { Label } from '@/shared/components/ui/Label'
import { FieldError } from '@/shared/components/ui/FieldError'

const schema = z.object({
  correo: z.email('Ingresá un correo válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})

type FormValues = z.infer<typeof schema>

const MENSAJES_ERROR: Record<ErrorInicioSesion, string> = {
  credenciales: 'Correo o contraseña incorrectos',
  'sin-permiso': 'Tu cuenta no tiene permisos de administrador',
  red: 'No se pudo iniciar sesión. Intentá de nuevo.',
}

export function LoginPage() {
  const [errorSesion, setErrorSesion] = useState<ErrorInicioSesion | null>(null)
  const { usuario, iniciarSesion } = useAuth()
  const avisoRef = useRef<HTMLParagraphElement>(null)
  const location = useLocation() as {
    state?: { from?: { pathname: string }; motivo?: 'inactividad' | 'contrasena-actualizada' }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const contrasenaActualizada = location.state?.motivo === 'contrasena-actualizada'

  // Una región viva que se monta con su texto no se anuncia de forma confiable: se enfoca.
  useEffect(() => {
    if (contrasenaActualizada) avisoRef.current?.focus()
  }, [contrasenaActualizada])

  if (usuario) {
    return <Navigate to={location.state?.from?.pathname ?? '/admin'} replace />
  }

  async function onSubmit(values: FormValues) {
    setErrorSesion(null)
    setErrorSesion(await iniciarSesion(values.correo, values.password))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-900 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary-800 text-lg font-bold text-white">
            .se
          </span>
          <h1 className="text-xl font-bold text-primary-800">Panel de Administración</h1>
        </div>

        {location.state?.motivo === 'inactividad' && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            Tu sesión se cerró por inactividad. Ingresá de nuevo para continuar.
          </p>
        )}

        {contrasenaActualizada && (
          <p
            ref={avisoRef}
            role="status"
            tabIndex={-1}
            className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            Contraseña actualizada. Ingresá con la nueva.
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

          <div>
            <Label htmlFor="password">Contraseña</Label>
            <InputPassword
              id="password"
              autoComplete="current-password"
              placeholder="Ingrese su contraseña"
              error={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            <FieldError id="password-error" message={errors.password?.message} />
          </div>

          {errorSesion && (
            <p role="alert" className="text-sm text-red-600">
              {MENSAJES_ERROR[errorSesion]}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </Button>

          <p className="text-center text-sm">
            <Link to="/admin/recuperar" className="text-primary-700 underline hover:text-primary-800">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
