import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerConfiguracion } from '@/features/configuracion/consultas'
import type { Configuracion } from '@/features/configuracion/types'
import { renderConProviders } from '@/test/utils'
import { PublicFooter } from './PublicFooter'

/* Contrato de consultas: ver useConfiguracion.test.ts. Campos en snake_case. */
vi.mock('@/features/configuracion/consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
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
})

describe('PublicFooter', () => {
  it('con la consulta rechazada muestra el fallback "Sitio institucional" y no se rompe', async () => {
    vi.mocked(obtenerConfiguracion).mockRejectedValue(new Error('sin red'))
    renderConProviders(<PublicFooter />)
    expect(await screen.findByText('Sitio institucional')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('con datos muestra nombre, iniciales, teléfono y correo', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({
      ...base,
      telefono: '3764 123456',
      correo: 'contacto@misiones.gob.ar',
    })
    renderConProviders(<PublicFooter />)
    expect(await screen.findByText('Escuela Modelo')).toBeInTheDocument()
    expect(screen.getByText('EM')).toBeInTheDocument()
    expect(screen.getByText('3764 123456')).toBeInTheDocument()
    expect(screen.getByText('contacto@misiones.gob.ar')).toBeInTheDocument()
  })

  it('oculta teléfono, correo y redes cuando están vacíos', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue(base)
    renderConProviders(<PublicFooter />)
    expect(await screen.findByText('Escuela Modelo')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
