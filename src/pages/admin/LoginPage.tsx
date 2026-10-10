import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, type ErrorInicioSesion } from '@/features/auth/AuthContext'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
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
  const [showPassword, setShowPassword] = useState(false)
  const [errorSesion, setErrorSesion] = useState<ErrorInicioSesion | null>(null)
  const { usuario, iniciarSesion } = useAuth()
  const location = useLocation() as { state?: { from?: { pathname: string } } }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Ingrese su contraseña"
                error={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
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
        </form>
      </div>
    </div>
  )
}
