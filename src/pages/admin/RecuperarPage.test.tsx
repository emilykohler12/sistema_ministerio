import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pedirRecuperacion } from '@/features/auth/consultas'
import { crearQueryClient } from '@/test/utils'
import { RecuperarPage } from './RecuperarPage'

/*
 * Contrato (#21): RecuperarPage (export nombrado) en /admin/recuperar, fuera de AdminLayout (no usa useAuth).
 *   - Campo "Correo electrónico" (type email) con error en FieldError id "correo-error" y aria-describedby.
 *   - Boton "Enviar enlace".
 *   - Exito (incluido el 429, que consultas ya devuelve como 'ok'): aviso neutro en role="status" con foco.
 *   - 'red': role="alert" "No se pudo enviar el enlace..." con foco; no muestra el aviso neutro.
 *   - Enlace "Volver a ingresar" a /admin/login.
 */
vi.mock('@/features/auth/consultas', () => ({
  pedirRecuperacion: vi.fn(),
  verificarEnlace: vi.fn(),
  cambiarContrasena: vi.fn(),
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  escucharSesion: vi.fn(),
}))

function renderPagina() {
  return render(
    <QueryClientProvider client={crearQueryClient()}>
      <MemoryRouter initialEntries={['/admin/recuperar']}>
        <Routes>
          <Route path="/admin/recuperar" element={<RecuperarPage />} />
          <Route path="/admin/login" element={<p>Login marcador</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function enviar(correo: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Correo electrónico'), correo)
  await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
}

beforeEach(() => vi.clearAllMocks())

describe('RecuperarPage', () => {
  it('con un correo valido muestra siempre el mismo aviso neutro en role=status', async () => {
    vi.mocked(pedirRecuperacion).mockResolvedValue('ok')
    renderPagina()
    await enviar('quien@dam.local')
    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('Si el correo corresponde a una cuenta, te enviamos un enlace')
    expect(aviso).toHaveTextContent('revisá spam o volvé a pedirlo más tarde')
    expect(pedirRecuperacion).toHaveBeenCalledExactlyOnceWith('quien@dam.local')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('el foco pasa al aviso al enviarse', async () => {
    vi.mocked(pedirRecuperacion).mockResolvedValue('ok')
    renderPagina()
    await enviar('quien@dam.local')
    expect(await screen.findByRole('status')).toHaveFocus()
  })

  it('un correo mal formado muestra el error junto al campo y no llama a Supabase', async () => {
    renderPagina()
    await enviar('no-es-un-correo')
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Ingresá un correo válido')
    expect(error).toHaveAttribute('id', 'correo-error')
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute(
      'aria-describedby',
      'correo-error',
    )
    expect(pedirRecuperacion).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('el campo de correo tiene type email y autocomplete username', () => {
    renderPagina()
    const campo = screen.getByLabelText('Correo electrónico')
    expect(campo).toHaveAttribute('type', 'email')
    expect(campo).toHaveAttribute('autocomplete', 'username')
  })

  it('un fallo de red muestra un mensaje propio en role=alert, con foco, y no el aviso neutro', async () => {
    vi.mocked(pedirRecuperacion).mockResolvedValue('red')
    renderPagina()
    await enviar('quien@dam.local')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('No se pudo enviar el enlace')
    expect(alerta).toHaveFocus()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('tras un fallo de red se puede reintentar', async () => {
    vi.mocked(pedirRecuperacion).mockResolvedValueOnce('red').mockResolvedValueOnce('ok')
    renderPagina()
    await enviar('quien@dam.local')
    await screen.findByRole('alert')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(pedirRecuperacion).toHaveBeenCalledTimes(2)
  })

  it('ofrece volver al login', () => {
    renderPagina()
    expect(screen.getByRole('link', { name: 'Volver a ingresar' })).toHaveAttribute(
      'href',
      '/admin/login',
    )
  })
})
