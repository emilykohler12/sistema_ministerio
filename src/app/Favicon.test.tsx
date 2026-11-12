import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerConfiguracion, urlLogo } from '@/features/configuracion/consultas'
import type { Configuracion } from '@/features/configuracion/types'
import { crearQueryClient } from '@/test/utils'
import { Favicon } from './Favicon'

/*
 * Contrato (criterios 1 y 7). src/app/Favicon.tsx, montado dentro de AppProviders (necesita QueryClientProvider):
 *   <Favicon />  // no renderiza nada; usa useLogo()
 *   - con logo: pone la URL pública en el `href` del único <link rel="icon"> de <head>;
 *   - sin logo (o al quitarlo): lo devuelve a "/favicon.svg";
 *   - solo cambia el `href`: no toca `type` ni crea más de un <link>; si el <link> no existe, lo crea;
 *   - mientras la configuración carga o si falla, no cambia el href.
 */
vi.mock('@/features/configuracion/consultas', () => ({
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

const iconos = () => document.head.querySelectorAll('link[rel="icon"]')

function montarFavicon() {
  const client = crearQueryClient()
  render(
    <QueryClientProvider client={client}>
      <Favicon />
    </QueryClientProvider>,
  )
  return client
}

function ponerLinkEstatico() {
  const link = document.createElement('link')
  link.setAttribute('rel', 'icon')
  link.setAttribute('href', '/favicon.svg')
  document.head.appendChild(link)
  return link
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(urlLogo).mockImplementation((ruta) => `https://storage.test/logo/${ruta}`)
  document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove())
})

afterEach(() => {
  document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove())
})

describe('Favicon', () => {
  it('con logo cambia solo el href del <link rel="icon"> existente, sin agregarle type ni crear otro', async () => {
    const link = ponerLinkEstatico()
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    montarFavicon()

    await waitFor(() => expect(link.getAttribute('href')).toBe('https://storage.test/logo/abc.png'))
    expect(iconos()).toHaveLength(1)
    expect(iconos()[0]).toBe(link)
    expect(link.hasAttribute('type')).toBe(false)
  })

  it('sin logo deja el favicon por defecto /favicon.svg', async () => {
    const link = ponerLinkEstatico()
    vi.mocked(obtenerConfiguracion).mockResolvedValue(fila)
    montarFavicon()

    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalled())
    await waitFor(() => expect(link.getAttribute('href')).toBe('/favicon.svg'))
    expect(iconos()).toHaveLength(1)
  })

  it('cambia sin recargar: al llegar un logo nuevo y al quitarlo, el href lo sigue', async () => {
    const link = ponerLinkEstatico()
    vi.mocked(obtenerConfiguracion).mockResolvedValue(fila)
    const client = montarFavicon()
    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalled())

    act(() => client.setQueryData(['configuracion'], { ...fila, logo_ruta: 'nuevo.webp' }))
    await waitFor(() => expect(link.getAttribute('href')).toBe('https://storage.test/logo/nuevo.webp'))

    act(() => client.setQueryData(['configuracion'], { ...fila, logo_ruta: null }))
    await waitFor(() => expect(link.getAttribute('href')).toBe('/favicon.svg'))
    expect(iconos()).toHaveLength(1)
  })

  it('sigue al logo después de queryClient.clear() (el login limpia la caché): la query vieja ya no está', async () => {
    const link = ponerLinkEstatico()
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    const client = montarFavicon()
    await waitFor(() => expect(link.getAttribute('href')).toBe('https://storage.test/logo/abc.png'))

    // Lo que hace AuthContext al cambiar el usuario: la caché se vacía y la configuración se vuelve a pedir.
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    act(() => client.clear())
    await waitFor(() => expect(client.getQueryData(['configuracion'])).toBeDefined())

    act(() => client.setQueryData(['configuracion'], { ...fila, logo_ruta: 'nuevo.png' }))
    await waitFor(() => expect(link.getAttribute('href')).toBe('https://storage.test/logo/nuevo.png'))
    expect(iconos()).toHaveLength(1)
  })

  it('si no existe el <link rel="icon"> lo crea (uno solo) con el href del logo', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    montarFavicon()

    await waitFor(() => expect(iconos()).toHaveLength(1))
    expect(iconos()[0].getAttribute('href')).toBe('https://storage.test/logo/abc.png')
    expect(iconos()[0].hasAttribute('type')).toBe(false)
  })

  it('mientras la configuración carga no toca el href', () => {
    const link = ponerLinkEstatico()
    vi.mocked(obtenerConfiguracion).mockReturnValue(new Promise(() => {}))
    montarFavicon()
    expect(link.getAttribute('href')).toBe('/favicon.svg')
    expect(iconos()).toHaveLength(1)
  })

  it('si la configuración falla deja el favicon por defecto', async () => {
    const link = ponerLinkEstatico()
    vi.mocked(obtenerConfiguracion).mockRejectedValue(new Error('sin red'))
    montarFavicon()
    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalled())
    expect(link.getAttribute('href')).toBe('/favicon.svg')
  })
})
