import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerConfiguracion, urlLogo } from '@/features/configuracion/consultas'
import type { Configuracion } from '@/features/configuracion/types'
import { renderConProviders } from '@/test/utils'
import { PublicHeader } from './PublicHeader'

/* Contrato de consultas: ver useConfiguracion.test.ts; urlLogo(ruta) arma la URL pública del bucket `logo`. */
vi.mock('@/features/configuracion/consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
  urlLogo: vi.fn(),
}))

const base: Configuracion = {
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(urlLogo).mockImplementation((ruta) => `https://storage.test/logo/${ruta}`)
})

describe('PublicHeader: logo', () => {
  it('sin logo muestra las iniciales y el nombre', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue(base)
    const { container } = renderConProviders(<PublicHeader />)
    expect(await screen.findByText('EM')).toBeInTheDocument()
    expect(screen.getByText('Escuela Modelo')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('con logo muestra la imagen decorativa (alt vacío) junto al nombre, sin iniciales', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...base, logo_ruta: 'abc.png' })
    const { container } = renderConProviders(<PublicHeader />)
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', 'https://storage.test/logo/abc.png')
    expect(img).toHaveAttribute('alt', '')
    expect(screen.getByText('Escuela Modelo')).toBeInTheDocument()
    expect(screen.queryByText('EM')).not.toBeInTheDocument()
  })

  it('con la consulta rechazada no se rompe: nombre de respaldo y sin imagen', async () => {
    vi.mocked(obtenerConfiguracion).mockRejectedValue(new Error('sin red'))
    const { container } = renderConProviders(<PublicHeader />)
    expect(await screen.findByText('Sitio institucional')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
