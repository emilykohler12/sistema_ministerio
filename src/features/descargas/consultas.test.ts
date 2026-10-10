import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recurso } from '@/features/recursos/types'
import { firmarEnlaces, registrarDescarga } from './consultas'
import type { DatosDescarga } from './types'

/*
 * Contrato (corte descargas, criterios 3 y 5). src/features/descargas/consultas.ts, solo supabase:
 *   registrarDescarga(tallerId: number, datos: DatosDescarga): Promise<void>
 *     supabase.rpc('registrar_descarga', { p_taller_id, p_cargo, p_localidad_id, p_institucion_tipo,
 *       p_cargo_otro, p_establecimiento_id, p_institucion_otra }); lanza el error de la RPC (conserva `code`).
 *   firmarEnlaces(recursos: Recurso[]): Promise<EnlaceDescarga[]>      // EnlaceDescarga = { recurso, url }
 *     - archivos: supabase.storage.from('talleres').createSignedUrl(ruta_archivo, 3600, { download: nombreDeDescarga(r) }),
 *       en paralelo; url = data.signedUrl. Si alguna firma falla, lanza.
 *     - enlaces (ENLACE): url tal cual, sin llamar a storage.
 *     - el resultado respeta `orden` (desempate por id), sea cual sea el orden de entrada.
 */
const { rpc, createSignedUrl, from } = vi.hoisted(() => {
  const rpc = vi.fn()
  const createSignedUrl = vi.fn()
  const from = vi.fn(() => ({ createSignedUrl }))
  return { rpc, createSignedUrl, from }
})
vi.mock('@/shared/lib/supabase', () => ({ supabase: { rpc, storage: { from } } }))

function recurso(id: number, orden: number, p: Partial<Recurso> = {}): Recurso {
  return {
    id,
    taller_id: 7,
    nombre: `Recurso ${id}`,
    tipo: 'PDF',
    ruta_archivo: `7/${id}.pdf`,
    url: null,
    tamanio_bytes: 1000,
    orden,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}
const enlace = (id: number, orden: number, url: string) =>
  recurso(id, orden, { tipo: 'ENLACE', ruta_archivo: null, tamanio_bytes: null, url })

beforeEach(() => {
  vi.clearAllMocks()
  from.mockImplementation(() => ({ createSignedUrl }))
  rpc.mockResolvedValue({ data: null, error: null })
  createSignedUrl.mockImplementation(async (ruta: string) => ({
    data: { signedUrl: `https://firmada.test/${ruta}` },
    error: null,
  }))
})

describe('registrarDescarga', () => {
  const padron: DatosDescarga = {
    cargo: 'Docente',
    cargo_otro: null,
    localidad_id: 3,
    institucion_tipo: 'PADRON',
    establecimiento_id: 12,
    institucion_otra: null,
  }

  it('llama a la RPC registrar_descarga con los parámetros p_*', async () => {
    await registrarDescarga(7, padron)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'registrar_descarga',
      expect.objectContaining({
        p_taller_id: 7,
        p_cargo: 'Docente',
        p_localidad_id: 3,
        p_institucion_tipo: 'PADRON',
        p_establecimiento_id: 12,
      }),
    )
  })

  it('envía cargo_otro e institucion_otra cuando corresponden', async () => {
    await registrarDescarga(7, {
      cargo: 'Otro',
      cargo_otro: 'Bibliotecaria',
      localidad_id: 3,
      institucion_tipo: 'OTRA',
      establecimiento_id: null,
      institucion_otra: 'Escuela Nueva',
    })
    const args = rpc.mock.calls[0][1]
    expect(args).toMatchObject({ p_cargo_otro: 'Bibliotecaria', p_institucion_otra: 'Escuela Nueva', p_institucion_tipo: 'OTRA' })
    expect(args.p_establecimiento_id ?? null).toBeNull()
  })

  it('lo que no se completó viaja como null, no como undefined ni vacío', async () => {
    await registrarDescarga(7, { cargo: 'Docente', localidad_id: 3, institucion_tipo: 'SIN_INSTITUCION' })
    const args = rpc.mock.calls[0][1]
    expect(args.p_cargo_otro ?? null).toBeNull()
    expect(args.p_establecimiento_id ?? null).toBeNull()
    expect(args.p_institucion_otra ?? null).toBeNull()
  })

  it('si la RPC responde con error, lo lanza tal cual (conserva el code)', async () => {
    const error = { code: 'DA003', message: 'no disponible', details: null }
    rpc.mockResolvedValue({ data: null, error })
    await expect(registrarDescarga(7, padron)).rejects.toMatchObject({ code: 'DA003' })
  })
})

describe('firmarEnlaces', () => {
  it('firma cada archivo en el bucket talleres con 3600 s y el nombre de descarga', async () => {
    const guia = recurso(1, 1, { nombre: 'Guía / 1°', ruta_archivo: '7/aaa.pdf' })
    const enlaces = await firmarEnlaces([guia])
    expect(from).toHaveBeenCalledWith('talleres')
    expect(createSignedUrl).toHaveBeenCalledWith('7/aaa.pdf', 3600, { download: 'Guia - 1-.pdf' })
    expect(enlaces).toEqual([{ recurso: guia, url: 'https://firmada.test/7/aaa.pdf' }])
  })

  it('pasa los enlaces externos tal cual y sin llamar a storage', async () => {
    const sitio = enlace(2, 1, 'https://example.com/programa')
    const enlaces = await firmarEnlaces([sitio])
    expect(createSignedUrl).not.toHaveBeenCalled()
    expect(enlaces).toEqual([{ recurso: sitio, url: 'https://example.com/programa' }])
  })

  it('respeta el orden de los recursos, con archivos y enlaces mezclados y entrada desordenada', async () => {
    const lista = [
      enlace(4, 3, 'https://example.com/c'),
      recurso(2, 1, { ruta_archivo: '7/b.pdf' }),
      recurso(3, 2, { ruta_archivo: '7/a.pdf' }),
    ]
    const enlaces = await firmarEnlaces(lista)
    expect(enlaces.map((e) => e.recurso.id)).toEqual([2, 3, 4])
    expect(enlaces.map((e) => e.url)).toEqual([
      'https://firmada.test/7/b.pdf',
      'https://firmada.test/7/a.pdf',
      'https://example.com/c',
    ])
  })

  it('firma todos los archivos a la vez, sin esperar uno por uno', async () => {
    createSignedUrl.mockImplementation(() => new Promise(() => {}))
    void firmarEnlaces([recurso(1, 1), recurso(2, 2), recurso(3, 3)])
    await new Promise((r) => setTimeout(r, 0))
    expect(createSignedUrl).toHaveBeenCalledTimes(3)
  })

  it('si falla la firma de un archivo, lanza el error', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found', statusCode: '404' } })
    await expect(firmarEnlaces([recurso(1, 1), recurso(2, 2)])).rejects.toBeTruthy()
  })

  it('una lista vacía da una lista vacía', async () => {
    expect(await firmarEnlaces([])).toEqual([])
  })
})
