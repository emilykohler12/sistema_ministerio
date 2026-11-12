import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cerrarSesion } from '@/features/auth/consultas'
import { obtenerConfiguracion, urlLogo } from '@/features/configuracion/consultas'
import type { Configuracion } from '@/features/configuracion/types'
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

// El panel muestra el nombre y el logo de la configuración (contrato de consultas: ver useConfiguracion.test.ts).
vi.mock('@/features/configuracion/consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
  urlLogo: vi.fn(),
}))

const config: Configuracion = {
  id: 1,
  nombre: 'Escuela Modelo',
  logo_ruta: null,
  telefono: '',
  correo: '',
  direccion: '',
  facebook: '',
  instagram: '',
  quienes_somos: '',
  mision: '',
  vision: '',
  updated_at: '2026-10-10T00:00:00Z',
}

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
  vi.mocked(obtenerConfiguracion).mockResolvedValue(config)
  vi.mocked(urlLogo).mockImplementation((ruta) => `https://storage.test/logo/${ruta}`)
})

describe('AdminSidebar: identidad', () => {
  it('muestra config.nombre en lugar del texto fijo de la Subsecretaría', async () => {
    renderSidebar()
    expect(await screen.findByText('Escuela Modelo')).toBeInTheDocument()
    expect(screen.queryByText(/Subsecretaría/)).not.toBeInTheDocument()
  })

  it('sin logo muestra las iniciales del nombre', async () => {
    renderSidebar()
    expect(await screen.findByText('EM')).toBeInTheDocument()
  })

  it('con logo muestra la imagen decorativa (alt vacío)', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...config, logo_ruta: 'abc.png' })
    const { container } = renderSidebar()
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', 'https://storage.test/logo/abc.png')
    expect(img).toHaveAttribute('alt', '')
  })

  it('si la configuración falla usa el nombre de respaldo "Sitio institucional" y no se rompe', async () => {
    vi.mocked(obtenerConfiguracion).mockRejectedValue(new Error('sin red'))
    renderSidebar()
    expect(await screen.findByText('Sitio institucional')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
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
