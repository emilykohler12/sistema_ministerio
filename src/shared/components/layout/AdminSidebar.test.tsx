import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cerrarSesion } from '@/features/auth/consultas'
import { ConAuth, simularSesion } from '@/test/auth'
import { AdminSidebar } from './AdminSidebar'

/*
 * #48: con el access token vencido y sin red, signOut tarda ~26 s (reintentos de auth-js). El botón muestra
 * "Cerrando sesión…" mientras no responde. Contrato de consultas y de useAuth: ver AuthContext.test.tsx.
 */
vi.mock('@/features/auth/consultas', () => ({
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  escucharSesion: vi.fn(),
}))

function renderSidebar() {
  return render(
    <ConAuth>
      <MemoryRouter initialEntries={['/admin']}>
        <AdminSidebar />
      </MemoryRouter>
    </ConAuth>,
  )
}

/** Deja `cerrarSesion` pendiente hasta que el test lo resuelva o lo rechace. */
function cierrePendiente() {
  let resolver!: () => void
  let rechazar!: (error: Error) => void
  vi.mocked(cerrarSesion).mockReturnValue(
    new Promise<void>((res, rej) => {
      resolver = res
      rechazar = rej
    }),
  )
  return { resolver, rechazar }
}

beforeEach(() => {
  vi.clearAllMocks()
  simularSesion()
})

describe('AdminSidebar: cerrar sesión', () => {
  it('antes del clic muestra "Cerrar sesión" habilitado y el aviso de estado vacío', () => {
    renderSidebar()
    const boton = screen.getByRole('button', { name: 'Cerrar sesión' })
    expect(boton).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('al hacer clic muestra "Cerrando sesión…" con aria-disabled y lo anuncia en la región ya montada', async () => {
    const user = userEvent.setup()
    cierrePendiente()
    renderSidebar()
    const aviso = screen.getByRole('status')
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    const boton = screen.getByRole('button', { name: /Cerrando sesión/ })
    expect(boton).toHaveTextContent('Cerrando sesión…')
    expect(boton).toHaveAttribute('aria-disabled', 'true')
    expect(boton).not.toBeDisabled()
    expect(boton).toHaveFocus()
    // Es el mismo nodo: una región que se monta ya con texto no se anuncia de forma confiable.
    expect(screen.getByRole('status')).toBe(aviso)
    expect(aviso).toHaveTextContent('Cerrando sesión')
  })

  it('un segundo clic mientras espera no llama otra vez a cerrarSesion', async () => {
    const user = userEvent.setup()
    cierrePendiente()
    renderSidebar()
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await user.click(screen.getByRole('button', { name: /Cerrando sesión/ }))
    expect(cerrarSesion).toHaveBeenCalledTimes(1)
  })

  it('si cerrarSesion rechaza vuelve a "Cerrar sesión" y permite reintentar', async () => {
    const user = userEvent.setup()
    const { rechazar } = cierrePendiente()
    renderSidebar()
    const aviso = screen.getByRole('status')
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(aviso).toHaveTextContent('Cerrando sesión')
    rechazar(new Error('Failed to fetch'))
    const boton = await screen.findByRole('button', { name: 'Cerrar sesión' })
    expect(boton).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('status')).toBe(aviso)
    expect(aviso).toBeEmptyDOMElement()

    vi.mocked(cerrarSesion).mockResolvedValue(undefined)
    await user.click(boton)
    expect(cerrarSesion).toHaveBeenCalledTimes(2)
  })
})
