import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConAuth, sesionAdmin, simularSesion } from '@/test/auth'
import { AdminLayout } from './AdminLayout'

/*
 * Contrato de consultas y de useAuth: ver AuthContext.test.tsx.
 * El skeleton de carga se expone con role="status" (un solo elemento mientras cargando = true).
 * Se usa un data router porque AdminLayout llama a useMatches.
 */
vi.mock('@/features/auth/consultas', () => ({
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  escucharSesion: vi.fn(),
}))

let emitir: ReturnType<typeof simularSesion>['emitir']

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [{ index: true, element: <p>Contenido hijo</p> }],
      },
      { path: '/admin/login', element: <p>Pantalla de login</p> },
    ],
    { initialEntries: ['/admin'] },
  )
  return render(
    <ConAuth>
      <RouterProvider router={router} />
    </ConAuth>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  ;({ emitir } = simularSesion())
})

describe('AdminLayout', () => {
  it('sin evento inicial muestra el skeleton y no redirige', () => {
    renderLayout()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Pantalla de login')).not.toBeInTheDocument()
    expect(screen.queryByText('Contenido hijo')).not.toBeInTheDocument()
  })

  it('con INITIAL_SESSION null redirige al login', async () => {
    renderLayout()
    emitir('INITIAL_SESSION', null)
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument()
  })

  it('con una sesión de admin renderiza el contenido hijo', async () => {
    renderLayout()
    emitir('INITIAL_SESSION', sesionAdmin)
    expect(await screen.findByText('Contenido hijo')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('al cerrar sesión (SIGNED_OUT) un admin termina en el login', async () => {
    renderLayout()
    emitir('INITIAL_SESSION', sesionAdmin)
    expect(await screen.findByText('Contenido hijo')).toBeInTheDocument()
    emitir('SIGNED_OUT', null)
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument()
    expect(screen.queryByText('Contenido hijo')).not.toBeInTheDocument()
  })
})
