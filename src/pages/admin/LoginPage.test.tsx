import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { iniciarSesion } from '@/features/auth/consultas'
import { ConAuth, sesionAdmin, sesionSinMarca, simularSesion } from '@/test/auth'
import { LoginPage } from './LoginPage'

/*
 * Contrato de consultas y de useAuth: ver AuthContext.test.tsx.
 * Textos asumidos:
 *   credenciales -> "Correo o contraseña incorrectos"
 *   sin-permiso  -> "Tu cuenta no tiene permisos de administrador"
 *   red          -> "No se pudo iniciar sesión. Intentá de nuevo."
 * Los mensajes se muestran en un elemento con role="alert".
 * La redirección usa state.from (un location: { pathname }) o '/admin'.
 */
vi.mock('@/features/auth/consultas', () => ({
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  escucharSesion: vi.fn(),
}))

let emitir: ReturnType<typeof simularSesion>['emitir']

function renderLogin(entrada: unknown = '/admin/login') {
  return render(
    <ConAuth>
      <MemoryRouter initialEntries={[entrada as string]}>
        <Routes>
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin" element={<p>Panel marcador</p>} />
          <Route path="/admin/talleres" element={<p>Talleres marcador</p>} />
        </Routes>
      </MemoryRouter>
    </ConAuth>,
  )
}

async function completarYEnviar(correo: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Correo electrónico'), correo)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  ;({ emitir } = simularSesion())
})

describe('LoginPage', () => {
  it('con credenciales incorrectas muestra el error y no entra', async () => {
    vi.mocked(iniciarSesion).mockResolvedValue({
      user: null,
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    } as never)
    renderLogin()
    emitir('INITIAL_SESSION', null)
    await completarYEnviar('admin@dam.local', 'mala')
    expect(await screen.findByText('Correo o contraseña incorrectos')).toBeInTheDocument()
    expect(screen.queryByText('Panel marcador')).not.toBeInTheDocument()
  })

  it('con una cuenta sin permiso muestra el aviso', async () => {
    vi.mocked(iniciarSesion).mockResolvedValue({ user: sesionSinMarca.user, error: null } as never)
    renderLogin()
    emitir('INITIAL_SESSION', null)
    await completarYEnviar('sin-permiso@dam.local', 'clave')
    expect(
      await screen.findByText('Tu cuenta no tiene permisos de administrador'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Panel marcador')).not.toBeInTheDocument()
  })

  it('ante un error de red muestra un mensaje genérico', async () => {
    vi.mocked(iniciarSesion).mockResolvedValue({
      user: null,
      error: { message: 'Failed to fetch' },
    } as never)
    renderLogin()
    emitir('INITIAL_SESSION', null)
    await completarYEnviar('admin@dam.local', 'clave')
    expect(
      await screen.findByText('No se pudo iniciar sesión. Intentá de nuevo.'),
    ).toBeInTheDocument()
  })

  it('si la consulta lanza muestra el mensaje genérico', async () => {
    vi.mocked(iniciarSesion).mockRejectedValue(new Error('storage lleno'))
    renderLogin()
    emitir('INITIAL_SESSION', null)
    await completarYEnviar('admin@dam.local', 'clave')
    expect(
      await screen.findByText('No se pudo iniciar sesión. Intentá de nuevo.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Panel marcador')).not.toBeInTheDocument()
  })

  it('con una sesión de admin ya iniciada redirige a /admin', async () => {
    renderLogin()
    emitir('INITIAL_SESSION', sesionAdmin)
    expect(await screen.findByText('Panel marcador')).toBeInTheDocument()
  })

  it('con una sesión de admin redirige a state.from si existe', async () => {
    renderLogin({ pathname: '/admin/login', state: { from: { pathname: '/admin/talleres' } } })
    emitir('INITIAL_SESSION', sesionAdmin)
    expect(await screen.findByText('Talleres marcador')).toBeInTheDocument()
  })

  it('tras un login correcto, cuando la sesión llega al contexto, redirige', async () => {
    vi.mocked(iniciarSesion).mockResolvedValue({ user: sesionAdmin.user, error: null } as never)
    renderLogin()
    emitir('INITIAL_SESSION', null)
    await completarYEnviar('admin@dam.local', 'ok')
    emitir('SIGNED_IN', sesionAdmin)
    await waitFor(() => expect(screen.getByText('Panel marcador')).toBeInTheDocument())
  })

  it('valida que el correo sea un email', async () => {
    renderLogin()
    emitir('INITIAL_SESSION', null)
    await completarYEnviar('no-es-un-email', 'clave')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(iniciarSesion).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('type', 'email')
  })

  it('no ofrece "Recordarme" ni "¿Olvidaste tu contraseña?"', () => {
    renderLogin()
    emitir('INITIAL_SESSION', null)
    expect(screen.queryByText('Recordarme')).not.toBeInTheDocument()
    expect(screen.queryByText('¿Olvidaste tu contraseña?')).not.toBeInTheDocument()
  })
})
