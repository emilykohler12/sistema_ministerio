import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { esquemaNuevaContrasena, type DatosNuevaContrasena } from '@/features/auth/esquema'
import { useCerrarSesion } from '@/features/auth/hooks/useCerrarSesion'
import {
  useRestablecerContrasena,
  type ResultadoRestablecer,
} from '@/features/auth/hooks/useRestablecerContrasena'
import { Button } from '@/shared/components/ui/Button'
import { FieldError } from '@/shared/components/ui/FieldError'
import { InputPassword } from '@/shared/components/ui/InputPassword'
import { Label } from '@/shared/components/ui/Label'

type Fallo = Exclude<ResultadoRestablecer, 'ok'>

const CLASE_LINK = 'text-primary-700 underline hover:text-primary-800'

const MENSAJES: Record<Exclude<Fallo, 'misma-contrasena'>, ReactNode> = {
  'enlace-invalido': (
    <>
      El enlace venció o ya se usó.{' '}
      <Link to="/admin/recuperar" className={CLASE_LINK}>
        Pedir otro enlace
      </Link>
    </>
  ),
  'sin-permiso': 'Tu cuenta no tiene permisos de administrador',
  'contrasena-debil': 'La contraseña es demasiado débil. Elegí otra.',
  reintentar:
    'No se pudo completar. Intentá de nuevo en unos minutos; si sigue fallando, pedí otro enlace',
}

/** Con estos códigos el formulario ya no sirve: el enlace está gastado o la cuenta no puede usarlo. */
const SIN_FORMULARIO: ReadonlySet<Fallo> = new Set(['enlace-invalido', 'sin-permiso'])

function Tarjeta({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-900 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary-800 text-lg font-bold text-white">
            .se
          </span>
          <h1 className="text-xl font-bold text-primary-800">Contraseña nueva</h1>
        </div>
        {children}
      </div>
    </div>
  )
}

const CLASE_ALERTA =
  'mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600'

export function NuevaContrasenaPage() {
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash') ?? ''
  const navigate = useNavigate()
  const restablecer = useRestablecerContrasena()
  const cerrar = useCerrarSesion()
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const alertaRef = useRef<HTMLParagraphElement>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosNuevaContrasena>({ resolver: zodResolver(esquemaNuevaContrasena) })

  // Sin token_hash el enlace no sirve: es el mismo mensaje que un enlace gastado.
  const falloVisible: Fallo | null = tokenHash ? fallo : 'enlace-invalido'

  useEffect(() => {
    if (falloVisible) alertaRef.current?.focus()
  }, [falloVisible])

  async function onSubmit({ password }: DatosNuevaContrasena) {
    // Se limpia antes para que un segundo fallo igual vuelva a montar el aviso y reciba el foco.
    setFallo(null)
    const codigo = await restablecer.mutateAsync({ tokenHash, password })
    if (codigo === 'ok') {
      navigate('/admin/login', { replace: true, state: { motivo: 'contrasena-actualizada' } })
      return
    }
    setFallo(codigo)
  }

  // La sesión que abrió verifyOtp sigue viva tras 'misma-contrasena': hay que cerrarla antes de ir al login,
  // que si no redirigiría al panel. Solo al pulsar el enlace: cerrar al desmontar chocaría con LoginPage y StrictMode.
  function irAIngresar(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    cerrar.mutate(undefined, { onSettled: () => navigate('/admin/login') })
  }

  return (
    <Tarjeta>
      {falloVisible && (
        <p ref={alertaRef} role="alert" tabIndex={-1} className={CLASE_ALERTA}>
          {falloVisible === 'misma-contrasena' ? (
            <>
              Esa ya es tu contraseña actual: ingresá con ella o elegí otra.{' '}
              <Link to="/admin/login" onClick={irAIngresar} className={CLASE_LINK}>
                Ir a ingresar
              </Link>
            </>
          ) : (
            MENSAJES[falloVisible]
          )}
        </p>
      )}

      {falloVisible && SIN_FORMULARIO.has(falloVisible) ? (
        falloVisible === 'sin-permiso' && (
          <p className="text-center text-sm">
            <Link to="/admin/login" className={CLASE_LINK}>
              Volver a ingresar
            </Link>
          </p>
        )
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="password">Contraseña nueva</Label>
            <InputPassword
              id="password"
              autoComplete="new-password"
              error={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            <FieldError id="password-error" message={errors.password?.message} />
          </div>

          <div>
            <Label htmlFor="confirmacion">Confirmá la contraseña</Label>
            <InputPassword
              id="confirmacion"
              autoComplete="new-password"
              error={!!errors.confirmacion}
              aria-describedby={errors.confirmacion ? 'confirmacion-error' : undefined}
              {...register('confirmacion')}
            />
            <FieldError id="confirmacion-error" message={errors.confirmacion?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={restablecer.isPending}>
            {restablecer.isPending ? 'Guardando...' : 'Guardar contraseña'}
          </Button>
        </form>
      )}
    </Tarjeta>
  )
}
