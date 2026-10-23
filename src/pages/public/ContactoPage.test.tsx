import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerConfiguracion } from '@/features/configuracion/consultas'
import type { Configuracion } from '@/features/configuracion/types'
import { renderConProviders } from '@/test/utils'
import { ContactoPage } from './ContactoPage'

vi.mock('@/features/configuracion/consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
}))

const base: Configuracion = {
  id: 1,
  nombre: 'Ministerio de Educación de Misiones',
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

const SIN_DATOS = 'Todavía no hay datos de contacto'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ContactoPage', () => {
  it('muestra teléfono, correo y dirección de la configuración, con enlaces tel: y mailto:', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({
      ...base,
      telefono: '3764 123456',
      correo: 'contacto@misiones.gob.ar',
      direccion: 'Av. Roque Sáenz Peña 1000, Posadas',
    })
    renderConProviders(<ContactoPage />)

    expect(await screen.findByText('3764 123456')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '3764 123456' })).toHaveAttribute('href', 'tel:3764123456')
    expect(screen.getByRole('link', { name: 'contacto@misiones.gob.ar' })).toHaveAttribute(
      'href',
      'mailto:contacto@misiones.gob.ar',
    )
    expect(screen.getByText('Av. Roque Sáenz Peña 1000, Posadas')).toBeInTheDocument()
    expect(screen.queryByText(SIN_DATOS)).not.toBeInTheDocument()
  })

  it('el subtítulo usa el nombre de la configuración', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...base, correo: 'contacto@misiones.gob.ar' })
    renderConProviders(<ContactoPage />)

    await screen.findByText('contacto@misiones.gob.ar')
    expect(screen.getByText(/Comunicate con Ministerio de Educación de Misiones/)).toBeInTheDocument()
  })

  it('oculta los campos vacíos y muestra solo los que tienen valor', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...base, telefono: '3764 123456' })
    renderConProviders(<ContactoPage />)

    expect(await screen.findByText('3764 123456')).toBeInTheDocument()
    expect(screen.queryByText('Correo')).not.toBeInTheDocument()
    expect(screen.queryByText('Dirección')).not.toBeInTheDocument()
    expect(screen.queryByText(SIN_DATOS)).not.toBeInTheDocument()
  })

  it('sin ningún dato muestra "Todavía no hay datos de contacto"', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue(base)
    renderConProviders(<ContactoPage />)

    expect(await screen.findByText(SIN_DATOS)).toBeInTheDocument()
    expect(screen.queryByText('Teléfono')).not.toBeInTheDocument()
  })

  it('mientras carga muestra un esqueleto y no el texto de "sin datos"', () => {
    vi.mocked(obtenerConfiguracion).mockReturnValue(new Promise(() => {}))
    renderConProviders(<ContactoPage />)

    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
    expect(screen.queryByText(SIN_DATOS)).not.toBeInTheDocument()
  })

  it('si falla la carga muestra el error con "Reintentar" y no el texto de "sin datos"', async () => {
    vi.mocked(obtenerConfiguracion).mockRejectedValue(new Error('sin red'))
    renderConProviders(<ContactoPage />)

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByText(SIN_DATOS)).not.toBeInTheDocument()

    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...base, telefono: '3764 123456' })
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('3764 123456')).toBeInTheDocument()
  })

  it('muestra Facebook e Instagram como enlaces externos que abren en otra pestaña', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({
      ...base,
      facebook: 'https://facebook.com/ministerio',
      instagram: 'https://instagram.com/ministerio',
    })
    renderConProviders(<ContactoPage />)

    const facebook = await screen.findByRole('link', { name: 'https://facebook.com/ministerio' })
    expect(facebook).toHaveAttribute('href', 'https://facebook.com/ministerio')
    expect(facebook).toHaveAttribute('target', '_blank')
    expect(facebook).toHaveAttribute('rel', 'noreferrer')
    const instagram = screen.getByRole('link', { name: 'https://instagram.com/ministerio' })
    expect(instagram).toHaveAttribute('href', 'https://instagram.com/ministerio')
    expect(instagram).toHaveAttribute('target', '_blank')
    expect(instagram).toHaveAttribute('rel', 'noreferrer')
  })

  it('con solo las redes cargadas no muestra "Todavía no hay datos de contacto"', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...base, instagram: 'https://instagram.com/ministerio' })
    renderConProviders(<ContactoPage />)

    expect(await screen.findByText('Instagram')).toBeInTheDocument()
    expect(screen.queryByText(SIN_DATOS)).not.toBeInTheDocument()
  })

  it('oculta la red social que no tiene valor', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...base, facebook: 'https://facebook.com/ministerio' })
    renderConProviders(<ContactoPage />)

    expect(await screen.findByText('Facebook')).toBeInTheDocument()
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument()
  })

  it('ya no muestra los datos fijos de CABA', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue(base)
    renderConProviders(<ContactoPage />)

    await screen.findByText(SIN_DATOS)
    expect(screen.queryByText(/CABA|Pizzurno|0800 555 1234|info@educacion\.gob\.ar/)).not.toBeInTheDocument()
  })
})
