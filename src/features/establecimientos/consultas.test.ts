import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerSinVincular, vincularInstitucion } from './consultas'
import type { GrupoSinVincular } from './types'

/*
 * Contrato (instituciones sin vincular), src/features/establecimientos/consultas.ts, solo supabase:
 *   obtenerSinVincular(): Promise<GrupoSinVincular[]>
 *     supabase.rpc('instituciones_sin_vincular') sin argumentos; lanza el error de la RPC (conserva `code`).
 *   vincularInstitucion(localidadId: number, nombre: string, establecimientoId: number): Promise<number>
 *     supabase.rpc('vincular_institucion', { p_localidad_id, p_nombre, p_establecimiento_id }); devuelve la cantidad
 *     (0 es un resultado válido: ya estaba vinculado); lanza el error de la RPC.
 *   GrupoSinVincular (types.ts) = Returns de la RPC: { localidad_id, localidad, nombre, variantes: string[], descargas, ultima }.
 */
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: { rpc } }))

const grupo: GrupoSinVincular = {
  localidad_id: 2,
  localidad: 'Posadas',
  nombre: 'Escuela 123',
  variantes: [],
  descargas: 2,
  ultima: '2026-10-16T12:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('obtenerSinVincular', () => {
  it('llama a la RPC instituciones_sin_vincular y devuelve los grupos', async () => {
    rpc.mockResolvedValue({ data: [grupo], error: null })
    await expect(obtenerSinVincular()).resolves.toEqual([grupo])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('instituciones_sin_vincular')
  })

  it('lanza el error de la RPC conservando el code', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(obtenerSinVincular()).rejects.toMatchObject({ code: '42501' })
  })

  it('propaga el rechazo de supabase-js (red)', async () => {
    rpc.mockRejectedValue(new Error('sin red'))
    await expect(obtenerSinVincular()).rejects.toThrow('sin red')
  })
})

describe('vincularInstitucion', () => {
  it('llama a la RPC vincular_institucion con los parámetros p_* y devuelve la cantidad', async () => {
    rpc.mockResolvedValue({ data: 3, error: null })
    await expect(vincularInstitucion(2, 'Escuela 123', 40)).resolves.toBe(3)
    expect(rpc).toHaveBeenCalledWith('vincular_institucion', {
      p_localidad_id: 2,
      p_nombre: 'Escuela 123',
      p_establecimiento_id: 40,
    })
  })

  it('devuelve 0 (no es un error) cuando el grupo ya estaba vinculado', async () => {
    rpc.mockResolvedValue({ data: 0, error: null })
    await expect(vincularInstitucion(2, 'Escuela 123', 40)).resolves.toBe(0)
  })

  it('lanza el error de la RPC conservando el code (DA005)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'DA005', message: 'no vinculable' } })
    await expect(vincularInstitucion(2, 'Escuela 123', 40)).rejects.toMatchObject({ code: 'DA005' })
  })

  it('propaga el rechazo de supabase-js (red)', async () => {
    rpc.mockRejectedValue(new Error('sin red'))
    await expect(vincularInstitucion(2, 'Escuela 123', 40)).rejects.toThrow('sin red')
  })
})
