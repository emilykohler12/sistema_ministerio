import { QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { obtenerConfiguracion, urlLogo } from '../consultas'
import { cambiarLogo, quitarLogo } from '../secuencias'
import type { Configuracion } from '../types'
import { useCambiarLogo, useLogo, useQuitarLogo } from './useLogo'

/*
 * Contrato (criterios 1, 2, 4 y 8). src/features/configuracion/hooks/useLogo.ts:
 *   useLogo(): { isPending: boolean; url: string | null; iniciales: string }
 *     sobre useConfiguracion (['configuracion']): url = urlLogo(logo_ruta) o null si no hay logo o no hay datos;
 *     iniciales = getInitials(nombre) ('' si no hay datos). isPending es el de la query.
 *   useCambiarLogo(): mutation, mutate({ file, anterior }) -> secuencias.cambiarLogo(file, anterior)
 *   useQuitarLogo():  mutation, mutate({ anterior })      -> secuencias.quitarLogo(anterior)
 *     las dos hacen setQueryData(['configuracion'], filaDevuelta) en éxito y exponen isPending.
 */
vi.mock('../consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
  urlLogo: vi.fn(),
}))
vi.mock('../secuencias', () => ({ cambiarLogo: vi.fn(), quitarLogo: vi.fn() }))

const fila: Configuracion = {
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

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(urlLogo).mockImplementation((ruta) => `https://storage.test/logo/${ruta}`)
})

describe('useLogo', () => {
  it('mientras carga, isPending es true y no hay url ni iniciales', () => {
    vi.mocked(obtenerConfiguracion).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useLogo(), { wrapper: crearContexto().wrapper })
    expect(result.current.isPending).toBe(true)
    expect(result.current.url).toBeNull()
  })

  it('sin logo_ruta: url null e iniciales del nombre', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue(fila)
    const { result } = renderHook(() => useLogo(), { wrapper: crearContexto().wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.url).toBeNull()
    expect(result.current.iniciales).toBe('MD')
  })

  it('con logo_ruta: la url pública que arma urlLogo', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'abc.png' })
    const { result } = renderHook(() => useLogo(), { wrapper: crearContexto().wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.url).toBe('https://storage.test/logo/abc.png')
    expect(urlLogo).toHaveBeenCalledWith('abc.png')
  })

  it('si la configuración falla, deja de estar pendiente y no hay url ni iniciales', async () => {
    vi.mocked(obtenerConfiguracion).mockRejectedValue(new Error('sin red'))
    const { result } = renderHook(() => useLogo(), { wrapper: crearContexto().wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.url).toBeNull()
    expect(result.current.iniciales).toBe('')
  })
})

describe('useCambiarLogo', () => {
  it('llama a cambiarLogo con el archivo y el anterior, y deja en caché la fila devuelta', async () => {
    const devuelta = { ...fila, logo_ruta: 'nueva.png', updated_at: '2026-11-11T00:00:00Z' }
    vi.mocked(cambiarLogo).mockResolvedValue(devuelta)
    const { client, wrapper } = crearContexto()
    client.setQueryData(['configuracion'], fila)
    const { result } = renderHook(() => useCambiarLogo(), { wrapper })

    const file = new File(['x'], 'logo.png')
    result.current.mutate({ file, anterior: null })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(cambiarLogo).toHaveBeenCalledWith(file, null)
    expect(client.getQueryData(['configuracion'])).toEqual(devuelta)
  })

  it('expone isPending mientras la secuencia no terminó', async () => {
    let resolver!: (f: Configuracion) => void
    vi.mocked(cambiarLogo).mockReturnValue(new Promise((res) => (resolver = res)))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useCambiarLogo(), { wrapper })

    result.current.mutate({ file: new File(['x'], 'logo.png'), anterior: 'vieja.png' })
    await waitFor(() => expect(result.current.isPending).toBe(true))
    resolver(fila)
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('si cambiarLogo rechaza, queda en error y la caché no cambia', async () => {
    vi.mocked(cambiarLogo).mockRejectedValue({ code: 'PGRST116' })
    const { client, wrapper } = crearContexto()
    client.setQueryData(['configuracion'], fila)
    const { result } = renderHook(() => useCambiarLogo(), { wrapper })

    result.current.mutate({ file: new File(['x'], 'logo.png'), anterior: null })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData(['configuracion'])).toEqual(fila)
  })
})

describe('invalidación tras un error', () => {
  it('un PGRST116 al cambiar vuelve a pedir la configuración (el anterior de la caché ya no es el real)', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'vieja.png' })
    vi.mocked(cambiarLogo).mockRejectedValue({ code: 'PGRST116' })
    const { client, wrapper } = crearContexto()
    const { result: config } = renderHook(() => useLogo(), { wrapper })
    await waitFor(() => expect(config.current.isPending).toBe(false))
    expect(obtenerConfiguracion).toHaveBeenCalledTimes(1)
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'otra.png' })

    const { result } = renderHook(() => useCambiarLogo(), { wrapper })
    result.current.mutate({ file: new File(['x'], 'logo.png'), anterior: 'vieja.png' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(client.getQueryData<Configuracion>(['configuracion'])?.logo_ruta).toBe('otra.png'))
  })

  it('un PGRST116 al quitar vuelve a pedir la configuración', async () => {
    vi.mocked(obtenerConfiguracion).mockResolvedValue({ ...fila, logo_ruta: 'vieja.png' })
    vi.mocked(quitarLogo).mockRejectedValue({ code: 'PGRST116' })
    const { wrapper } = crearContexto()
    const { result: config } = renderHook(() => useLogo(), { wrapper })
    await waitFor(() => expect(config.current.isPending).toBe(false))

    const { result } = renderHook(() => useQuitarLogo(), { wrapper })
    result.current.mutate({ anterior: 'vieja.png' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    await waitFor(() => expect(obtenerConfiguracion).toHaveBeenCalledTimes(2))
  })
})

describe('useQuitarLogo', () => {
  it('llama a quitarLogo con el anterior y deja en caché la fila devuelta', async () => {
    const devuelta = { ...fila, logo_ruta: null, updated_at: '2026-11-11T00:00:00Z' }
    vi.mocked(quitarLogo).mockResolvedValue(devuelta)
    const { client, wrapper } = crearContexto()
    client.setQueryData(['configuracion'], { ...fila, logo_ruta: 'abc.png' })
    const { result } = renderHook(() => useQuitarLogo(), { wrapper })

    result.current.mutate({ anterior: 'abc.png' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(quitarLogo).toHaveBeenCalledWith('abc.png')
    expect(client.getQueryData(['configuracion'])).toEqual(devuelta)
  })

  it('si quitarLogo rechaza, queda en error y la caché conserva el logo', async () => {
    vi.mocked(quitarLogo).mockRejectedValue(new Error('RLS'))
    const { client, wrapper } = crearContexto()
    const conLogo = { ...fila, logo_ruta: 'abc.png' }
    client.setQueryData(['configuracion'], conLogo)
    const { result } = renderHook(() => useQuitarLogo(), { wrapper })

    result.current.mutate({ anterior: 'abc.png' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData(['configuracion'])).toEqual(conLogo)
  })
})
