import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cerrarSesion } from '@/features/auth/consultas'
import { Dialog } from '@/shared/components/ui/Dialog'
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

function Login() {
  const state = useLocation().state as { motivo?: string } | null
  return (
    <>
      <p>Pantalla de login</p>
      {state?.motivo && <p>Motivo: {state.motivo}</p>}
    </>
  )
}

let emitir: ReturnType<typeof simularSesion>['emitir']

function renderLayout(hijo: ReactNode = <p>Contenido hijo</p>) {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [{ index: true, element: hijo }],
      },
      { path: '/admin/login', element: <Login /> },
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

const MIN = 60_000

function avanzar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('AdminLayout: cierre por inactividad', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a los 28 minutos sin actividad muestra el aviso y "Seguir conectado" lo cierra y reinicia el plazo', () => {
    renderLayout()
    emitir('INITIAL_SESSION', sesionAdmin)
    expect(screen.getByText('Contenido hijo')).toBeInTheDocument()
    avanzar(27 * MIN)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    avanzar(2 * MIN)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    avanzar(29 * MIN)
    expect(cerrarSesion).not.toHaveBeenCalled()
    expect(screen.getByText('Contenido hijo')).toBeInTheDocument()
  })

  it('la actividad antes del aviso reinicia el plazo', () => {
    renderLayout()
    emitir('INITIAL_SESSION', sesionAdmin)
    avanzar(20 * MIN)
    fireEvent.pointerDown(document.body)
    avanzar(20 * MIN)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(cerrarSesion).not.toHaveBeenCalled()
  })

  it('a los 30 minutos cierra la sesión con cerrarSesion y va al login con el motivo', () => {
    vi.mocked(cerrarSesion).mockImplementation(async () => {
      emitir('SIGNED_OUT', null)
    })
    renderLayout()
    emitir('INITIAL_SESSION', sesionAdmin)
    avanzar(30 * MIN + 1000)
    expect(cerrarSesion).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Pantalla de login')).toBeInTheDocument()
    expect(screen.getByText('Motivo: inactividad')).toBeInTheDocument()
    expect(screen.queryByText('Contenido hijo')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('un cierre de sesión manual no lleva el motivo de inactividad', () => {
    renderLayout()
    emitir('INITIAL_SESSION', sesionAdmin)
    emitir('SIGNED_OUT', null)
    expect(screen.getByText('Pantalla de login')).toBeInTheDocument()
    expect(screen.queryByText(/Motivo/)).not.toBeInTheDocument()
  })

  it('sin usuario no corre ningún temporizador ni cierra sesión', () => {
    renderLayout()
    emitir('INITIAL_SESSION', null)
    expect(screen.getByText('Pantalla de login')).toBeInTheDocument()
    avanzar(60 * MIN)
    expect(cerrarSesion).not.toHaveBeenCalled()
  })

  it('mientras carga la sesión no cuenta inactividad', () => {
    renderLayout()
    avanzar(60 * MIN)
    expect(cerrarSesion).not.toHaveBeenCalled()
  })

  it('con un diálogo abierto debajo, el aviso se anuncia con su nombre y Escape no cierra el de abajo', () => {
    const alCerrarDeAbajo = vi.fn()
    renderLayout(
      <Dialog open onClose={alCerrarDeAbajo} title="Agregar recurso" description="Formulario a medias">
        <p>Contenido hijo</p>
      </Dialog>,
    )
    emitir('INITIAL_SESSION', sesionAdmin)
    avanzar(29 * MIN)

    const aviso = screen.getByRole('alertdialog', { name: 'Tu sesión está por cerrarse' })
    expect(aviso).toHaveAccessibleDescription(/inactividad/i)
    expect(screen.getByRole('dialog', { name: 'Agregar recurso' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(alCerrarDeAbajo).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Agregar recurso' })).toBeInTheDocument()
    avanzar(29 * MIN)
    expect(cerrarSesion).not.toHaveBeenCalled()
  })
})
