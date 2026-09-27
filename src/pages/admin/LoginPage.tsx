import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { FieldError } from '@/shared/components/ui/FieldError'

const schema = z.object({
  correo: z.string().min(1, 'Ingresá tu usuario o correo'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
  recordarme: z.boolean().optional(),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname: string } } }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    await new Promise((r) => setTimeout(r, 500))
    const nombre = values.correo.split('@')[0] || 'Administrador'
    login(nombre)
    navigate(location.state?.from?.pathname ?? '/admin', { replace: true })
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
              type="text"
              placeholder="Ingrese su usuario o correo"
              error={!!errors.correo}
              aria-describedby={errors.correo ? 'correo-error' : undefined}
              {...register('correo')}
            />
            <FieldError id="correo-error" message={errors.correo?.message} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <a href="#recuperar" className="text-sm font-medium text-primary-600 hover:underline">
                ¿Olvidaste tu contraseña?
              </a>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
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

          <div className="flex items-center gap-2">
            <input
              id="recordarme"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              {...register('recordarme')}
            />
            <Label htmlFor="recordarme" className="mb-0">
              Recordarme
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
