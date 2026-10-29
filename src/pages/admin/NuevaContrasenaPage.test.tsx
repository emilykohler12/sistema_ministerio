import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cambiarContrasena, cerrarSesion, verificarEnlace } from '@/features/auth/consultas'
import { crearQueryClient } from '@/test/utils'
import { NuevaContrasenaPage } from './NuevaContrasenaPage'

/*
 * Contrato (#21): NuevaContrasenaPage (export nombrado) en /admin/nueva-contrasena?token_hash=<hash>, fuera de AdminLayout.
 *   - Lee token_hash de la query. Sin el: role="alert" explicando que el enlace no sirve, sin formulario, con el enlace
 *     "Pedir otro enlace" a /admin/recuperar.
 *   - Campos "Contraseña nueva" (id password, FieldError "password-error") y "Confirmá la contraseña"
 *     (id confirmacion, FieldError "confirmacion-error"), ambos InputPassword; boton "Guardar contraseña".
 *   - Valida con esquemaNuevaContrasena antes de llamar a consultas.
 *   - Llama verificarEnlace(tokenHash) y despues cambiarContrasena(password) via useRestablecerContrasena.
 *   - 'ok': navega a /admin/login con state { motivo: 'contrasena-actualizada' } recien cuando la consulta resolvio.
 *   - 'enlace-invalido' | 'reintentar'... ver cada test para su texto.
 */
vi.mock('@/features/auth/consultas', () => ({
  pedirRecuperacion: vi.fn(),
  verificarEnlace: vi.fn(),
  cambiarContrasena: vi.fn(),
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  escucharSesion: vi.fn(),
}))

function LoginMarcador() {
  const { state } = useLocation() as { state?: { motivo?: string } }
  return <p>Login marcador {state?.motivo}</p>
}

function renderPagina(ruta = '/admin/nueva-contrasena?token_hash=tok123') {
  return render(
    <QueryClientProvider client={crearQueryClient()}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/admin/nueva-contrasena" element={<NuevaContrasenaPage />} />
          <Route path="/admin/recuperar" element={<p>Recuperar marcador</p>} />
          <Route path="/admin/login" element={<LoginMarcador />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function completar(password: string, confirmacion = password) {
  const user = userEvent.setup()
  const campo = screen.getByLabelText('Contraseña nueva')
  const conf = screen.getByLabelText('Confirmá la contraseña')
  await user.clear(campo)
  await user.clear(conf)
  await user.type(campo, password)
  await user.type(conf, confirmacion)
  await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verificarEnlace).mockResolvedValue('ok')
})

describe('NuevaContrasenaPage sin sesion ni llamadas previas', () => {
  it('con token_hash muestra el formulario y no llama a Supabase al abrir', () => {
    renderPagina()
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Confirmá la contraseña')).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(verificarEnlace).not.toHaveBeenCalled()
  })

  it('sin token_hash muestra un role=alert con la opcion de pedir otro enlace y sin formulario', () => {
    renderPagina('/admin/nueva-contrasena')
    expect(screen.getByRole('alert')).toHaveTextContent(/enlace/i)
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute(
      'href',
      '/admin/recuperar',
    )
  })

  it('sin token_hash el aviso recibe el foco', () => {
    renderPagina('/admin/nueva-contrasena')
    expect(screen.getByRole('alert')).toHaveFocus()
  })

  it('con token_hash vacio se trata como ausente', () => {
    renderPagina('/admin/nueva-contrasena?token_hash=')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument()
  })
})

describe('NuevaContrasenaPage validacion', () => {
  it('menos de 8 caracteres: error junto al campo con aria-describedby y sin llamar a Supabase', async () => {
    renderPagina()
    await completar('corta')
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('La contraseña debe tener al menos 8 caracteres')
    expect(error).toHaveAttribute('id', 'password-error')
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute(
      'aria-describedby',
      'password-error',
    )
    expect(verificarEnlace).not.toHaveBeenCalled()
  })

  it('mas de 72 bytes (37 ñ): error junto al campo', async () => {
    renderPagina()
    await completar('ñ'.repeat(37))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usá como máximo 72 caracteres (menos si tiene tildes o ñ)',
    )
    expect(verificarEnlace).not.toHaveBeenCalled()
  })

  it('confirmacion distinta: error junto al campo de confirmacion', async () => {
    renderPagina()
    await completar('clave-larga-1', 'clave-larga-2')
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Las contraseñas no coinciden')
    expect(error).toHaveAttribute('id', 'confirmacion-error')
    expect(screen.getByLabelText('Confirmá la contraseña')).toHaveAttribute(
      'aria-describedby',
      'confirmacion-error',
    )
    expect(verificarEnlace).not.toHaveBeenCalled()
  })
})

describe('NuevaContrasenaPage guardado', () => {
  it('llama con el token y la contraseña y navega al login con el motivo recien al resolver', async () => {
    let resolver!: (v: 'ok') => void
    vi.mocked(cambiarContrasena).mockReturnValue(
      new Promise((r) => {
        resolver = r as typeof resolver
      }),
    )
    renderPagina()
    await completar('clave-larga-1')
    await waitFor(() => expect(cambiarContrasena).toHaveBeenCalledExactlyOnceWith('clave-larga-1'))
    expect(verificarEnlace).toHaveBeenCalledExactlyOnceWith('tok123')
    // Todavia no cerro la sesion: sigue en la pagina.
    expect(screen.queryByText(/Login marcador/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardando|guardar contraseña/i })).toBeInTheDocument()
    resolver('ok')
    expect(await screen.findByText('Login marcador contrasena-actualizada')).toBeInTheDocument()
  })

  it('enlace vencido o usado: role=alert con la opcion de pedir otro enlace', async () => {
    vi.mocked(verificarEnlace).mockResolvedValue('enlace-invalido')
    renderPagina()
    await completar('clave-larga-1')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/enlace/i)
    expect(alerta).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute(
      'href',
      '/admin/recuperar',
    )
    expect(screen.queryByText(/Login marcador/)).not.toBeInTheDocument()
  })

  it('cuenta sin permisos: muestra el mensaje y no navega al login', async () => {
    vi.mocked(verificarEnlace).mockResolvedValue('sin-permiso')
    renderPagina()
    await completar('clave-larga-1')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu cuenta no tiene permisos de administrador',
    )
    expect(screen.queryByText(/Login marcador/)).not.toBeInTheDocument()
  })

  it('same_password: mensaje con enlace al login', async () => {
    vi.mocked(cambiarContrasena).mockResolvedValue('misma-contrasena')
    renderPagina()
    await completar('clave-larga-1')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'Esa ya es tu contraseña actual: ingresá con ella o elegí otra',
    )
    expect(within(alerta).getByRole('link')).toHaveAttribute('href', '/admin/login')
  })

  it('si no se pudo verificar el enlace avisa sin afirmar una causa y deja reintentar', async () => {
    vi.mocked(verificarEnlace).mockResolvedValueOnce('reintentar').mockResolvedValueOnce('ok')
    vi.mocked(cambiarContrasena).mockResolvedValue('ok')
    renderPagina()
    await completar('clave-larga-1')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'No se pudo completar. Intentá de nuevo en unos minutos; si sigue fallando, pedí otro enlace',
    )
    expect(alerta).toHaveFocus()
    expect(cambiarContrasena).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText('Login marcador contrasena-actualizada')).toBeInTheDocument()
    expect(verificarEnlace).toHaveBeenCalledTimes(2)
  })

  it('el enlace de misma-contrasena cierra la sesion y recien despues navega al login', async () => {
    vi.mocked(cambiarContrasena).mockResolvedValue('misma-contrasena')
    let terminarCierre!: () => void
    vi.mocked(cerrarSesion).mockReturnValue(
      new Promise<void>((r) => {
        terminarCierre = r
      }),
    )
    renderPagina()
    await completar('clave-larga-1')
    const alerta = await screen.findByRole('alert')
    expect(cerrarSesion).not.toHaveBeenCalled()
    await userEvent.setup().click(within(alerta).getByRole('link'))
    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Login marcador/)).not.toBeInTheDocument()
    terminarCierre()
    expect(await screen.findByText(/Login marcador/)).toBeInTheDocument()
  })

  it('contraseña debil: avisa con role=alert', async () => {
    vi.mocked(cambiarContrasena).mockResolvedValue('contrasena-debil')
    renderPagina()
    await completar('clave-larga-1')
    expect(await screen.findByRole('alert')).toHaveTextContent(/contraseña/i)
  })

  it('fallo de red: mensaje propio y se puede reintentar sin volver a verificar el token', async () => {
    vi.mocked(cambiarContrasena).mockResolvedValueOnce('reintentar').mockResolvedValueOnce('ok')
    renderPagina()
    await completar('clave-larga-1')
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo/i)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText('Login marcador contrasena-actualizada')).toBeInTheDocument()
    expect(verificarEnlace).toHaveBeenCalledExactlyOnceWith('tok123')
    expect(cambiarContrasena).toHaveBeenCalledTimes(2)
    expect(cambiarContrasena).toHaveBeenNthCalledWith(2, 'clave-larga-1')
  })

  it('tras same_password el reintento con otra contraseña no vuelve a verificar', async () => {
    vi.mocked(cambiarContrasena).mockResolvedValueOnce('misma-contrasena').mockResolvedValueOnce('ok')
    renderPagina()
    await completar('clave-larga-1')
    await screen.findByRole('alert')
    await completar('clave-larga-2')
    await screen.findByText(/Login marcador/)
    expect(verificarEnlace).toHaveBeenCalledExactlyOnceWith('tok123')
    expect(cambiarContrasena).toHaveBeenNthCalledWith(2, 'clave-larga-2')
  })
})

describe('NuevaContrasenaPage accesibilidad', () => {
  it('cada campo tiene su etiqueta y un boton para mostrar u ocultar', () => {
    renderPagina()
    expect(screen.getByLabelText('Contraseña nueva')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmá la contraseña')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mostrar contraseña' })).toHaveLength(2)
  })

  it('los campos nuevos piden autocomplete new-password', () => {
    renderPagina()
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Confirmá la contraseña')).toHaveAttribute(
      'autocomplete',
      'new-password',
    )
  })
})
