import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConAuth, sesionAdmin } from '@/test/auth'
import { AdminLayout } from './AdminLayout'

/*
 * Flujo real de #46: al vencer por inactividad con signOut fallando (sin red y con el access token vencido), el
 * panel no queda abierto: se descarta la sesión de sessionStorage y se recarga en /admin/login.
 * Acá NO se mockea features/auth/consultas: solo el cliente de supabase.
 */
const { signOut, onAuthStateChange } = vi.hoisted(() => ({ signOut: vi.fn(), onAuthStateChange: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({
  supabase: { auth: { signOut, onAuthStateChange } },
  CLAVE_SESION: 'dam-sesion-test',
}))

const MIN = 60_000
const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('location', { assign })
  sessionStorage.clear()
  sessionStorage.setItem('dam-sesion-test', '{"access_token":"vencido"}')
  onAuthStateChange.mockImplementation((cb: (evento: string, session: unknown) => void) => {
    cb('INITIAL_SESSION', sesionAdmin)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function renderLayout() {
  const router = createMemoryRouter(
    [{ path: '/admin', element: <AdminLayout />, children: [{ index: true, element: <p>Contenido hijo</p> }] }],
    { initialEntries: ['/admin'] },
  )
  render(
    <ConAuth>
      <RouterProvider router={router} />
    </ConAuth>,
  )
}

async function vencer() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30 * MIN + 1000)
  })
}

describe('AdminLayout: vencimiento con signOut fallando', () => {
  it('si signOut devuelve error descarta la sesión y recarga en /admin/login', async () => {
    signOut.mockResolvedValue({ error: new Error('Failed to fetch') })
    renderLayout()
    expect(screen.getByText('Contenido hijo')).toBeInTheDocument()
    await vencer()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('dam-sesion-test')).toBeNull()
    expect(assign).toHaveBeenCalledExactlyOnceWith('/admin/login')
  })

  it('si signOut lanza, también', async () => {
    signOut.mockRejectedValue(new Error('red caída'))
    renderLayout()
    await vencer()
    expect(sessionStorage.getItem('dam-sesion-test')).toBeNull()
    expect(assign).toHaveBeenCalledExactlyOnceWith('/admin/login')
  })

  it('si signOut sale bien no recarga la página', async () => {
    signOut.mockResolvedValue({ error: null })
    renderLayout()
    await vencer()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(assign).not.toHaveBeenCalled()
  })
})
