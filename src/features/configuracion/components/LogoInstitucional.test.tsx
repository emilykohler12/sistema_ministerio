import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { obtenerConfiguracion, urlLogo } from '../consultas'
import type { Configuracion } from '../types'
import { LogoInstitucional } from './LogoInstitucional'

/*
 * Contrato (criterios 1, 6 y 8). features/configuracion/components/LogoInstitucional.tsx, sobre useLogo:
 *   <LogoInstitucional className? alt? claseFallback? />
 *   - className: tamaño fijo de la caja (la misma para imagen, iniciales/ícono y caja de carga).
 *   - alt: por defecto "" (decorativo); la vista previa del panel pasa un alt.
 *   - cargando: caja vacía del mismo tamaño (sin iniciales, sin img).
 *   - sin logo: iniciales del nombre, o el ícono School (svg) si no hay nombre.
 *   - con logo: <img src={url}> con object-contain y sin rounded-full, key según la URL.
 *   - onError: cae a las iniciales/School; una URL nueva vuelve a intentar con la imagen.
 */
vi.mock('../consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
  urlLogo: vi.fn(),
}))

const fila: Configuracion = {
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

function renderLogo(props: Parameters<typeof LogoInstitucional>[0] = {}) {
  const client = crearQueryClient()
  const vista = render(
    <QueryClientProvider client={client}>
      <LogoInstitucional {...props} />
    </QueryClientProvider>,
  )
  return { client, ...vista }
}

const imagen = (c: HTMLElement) => c.querySelector('img')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(urlLogo).mockImplementation((ruta) => `https://storage.test/logo/${ruta}`)
})

describe('LogoInstitucional', () => {
  it('sin logo muestra las iniciales del nombre y ninguna imagen', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue(fila)
    const { container } = renderLogo()
    expect(await screen.findByText('EM')).toBeInTheDocument()
    expect(imagen(container)).toBeNull()
  })

  it('sin logo y sin nombre muestra el ícono School', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, nombre: '' })
    const { container } = renderLogo()
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull())
    expect(imagen(container)).toBeNull()
  })

  it('mientras carga la configuración muestra una caja vacía del mismo tamaño: sin iniciales ni imagen', () => {
    vi.mocked(obtenerConfiguracion).mockReturnValue(new Promise(() => {}))
    const { container } = renderLogo({ className: 'h-9 w-9' })
    const caja = container.firstElementChild as HTMLElement
    expect(caja).toHaveClass('h-9', 'w-9')
    expect(caja).toBeEmptyDOMElement()
  })

  it('con logo muestra la imagen decorativa (alt vacío) con la URL pública, object-contain y sin rounded-full', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    const { container } = renderLogo({ className: 'h-9 w-9' })
    await waitFor(() => expect(imagen(container)).not.toBeNull())
    const img = imagen(container)!
    expect(img).toHaveAttribute('src', 'https://storage.test/logo/abc.png')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveClass('object-contain')
    expect(img.className).not.toContain('rounded-full')
    expect(screen.queryByText('EM')).not.toBeInTheDocument()
  })

  it('el tamaño fijo que se pasa por className se aplica a la caja que contiene la imagen', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    const { container } = renderLogo({ className: 'h-16 w-16' })
    await waitFor(() => expect(imagen(container)).not.toBeNull())
    const marcados = container.querySelectorAll('.h-16.w-16')
    expect(marcados.length).toBeGreaterThan(0)
  })

  it('la vista previa puede llevar un alt propio', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    renderLogo({ alt: 'Logo actual de la institución' })
    expect(await screen.findByRole('img', { name: 'Logo actual de la institución' })).toBeInTheDocument()
  })

  it('si la imagen no carga (onError) cae a las iniciales sin romper', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'rota.png' })
    const { container } = renderLogo()
    await waitFor(() => expect(imagen(container)).not.toBeNull())
    fireEvent.error(imagen(container)!)
    expect(imagen(container)).toBeNull()
    expect(screen.getByText('EM')).toBeInTheDocument()
  })

  it('si la imagen no carga y no hay nombre cae al ícono School', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, nombre: '', logo_ruta: 'rota.png' })
    const { container } = renderLogo()
    await waitFor(() => expect(imagen(container)).not.toBeNull())
    fireEvent.error(imagen(container)!)
    expect(imagen(container)).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('tras un error, si llega una URL nueva vuelve a intentar con la imagen', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'rota.png' })
    const { client, container } = renderLogo()
    await waitFor(() => expect(imagen(container)).not.toBeNull())
    fireEvent.error(imagen(container)!)
    expect(imagen(container)).toBeNull()

    act(() => client.setQueryData(['configuracion'], { ...fila, logo_ruta: 'nueva.png' }))

    await waitFor(() => expect(imagen(container)).not.toBeNull())
    expect(imagen(container)).toHaveAttribute('src', 'https://storage.test/logo/nueva.png')
  })

  it('al quitar el logo vuelve a las iniciales', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    const { client, container } = renderLogo()
    await waitFor(() => expect(imagen(container)).not.toBeNull())

    act(() => client.setQueryData(['configuracion'], { ...fila, logo_ruta: null }))

    expect(await screen.findByText('EM')).toBeInTheDocument()
    expect(imagen(container)).toBeNull()
  })
})
