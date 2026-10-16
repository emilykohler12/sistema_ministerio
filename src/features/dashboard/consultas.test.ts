import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerMetricas } from './consultas'

/*
 * Contrato de consultas.ts (solo supabase; decisión 0012, spec criterios 2-7 y 8):
 *   obtenerMetricas(p: { desde: string; hasta: string; porMes: boolean }): Promise<Metricas>
 *   Llama en paralelo (Promise.all) a:
 *     supabase.rpc('metricas_resumen',      { p_desde, p_hasta })
 *     supabase.rpc('metricas_por_periodo',  { p_desde, p_hasta, p_por_mes })
 *     supabase.rpc('metricas_por_taller' | 'metricas_por_nivel' | 'metricas_por_cargo' | 'metricas_por_localidad', { p_desde, p_hasta })
 *     supabase.from('normativa').select('id, titulo, numero, anio, descargas')   // sin período, sin filtros
 *   Resultado (types.ts, derivado de Functions[...]['Returns']):
 *     Metricas = { resumen: ResumenMetricas   // la única fila de metricas_resumen, tal cual
 *                  serie: PuntoSerie[]        // metricas_por_periodo
 *                  talleres: FilaTaller[]     // metricas_por_taller
 *                  niveles: FilaNivel[]       // metricas_por_nivel
 *                  cargos: FilaCargo[]        // metricas_por_cargo
 *                  localidades: FilaLocalidad[] // metricas_por_localidad
 *                  normativas: NormativaConteo[] }  // { id, titulo, numero, anio, descargas }
 *   Sin ordenar ni calcular: eso es de calculos.ts. Lanza ante cualquier error (el `{ error }` de una RPC o del select,
 *   o un rechazo), conservando el error original. Una sola query que falla hace fallar todo.
 */
const { rpc, from, select } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), select: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: { rpc, from } }))

const resumen = { descargas: 8, establecimientos_alcanzados: 3, talleres_publicados: 5, sin_vincular: 2 }
const serie = [{ inicio: '2026-03-10', descargas: 1 }]
const talleres = [{ taller_id: 1, titulo: 'Taller 1', estado: 'PUBLICADO', descargas: 4 }]
const niveles = [{ nivel_id: 1, nombre: 'Inicial', descargas: 4 }]
const cargos = [{ cargo: 'Docente', descargas: 4 }]
const localidades = [{ localidad_id: 1, nombre: 'Posadas', descargas: 3, alcanzados: 2, padron: 10 }]
const normativas = [{ id: 1, titulo: 'Res. 1', numero: '1', anio: 2024, descargas: 9 }]

const porRpc: Record<string, unknown> = {
  metricas_resumen: [resumen],
  metricas_por_periodo: serie,
  metricas_por_taller: talleres,
  metricas_por_nivel: niveles,
  metricas_por_cargo: cargos,
  metricas_por_localidad: localidades,
}
const periodo = { desde: '2026-03-10', hasta: '2026-03-12', porMes: false }

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockImplementation(async (nombre: string) => ({ data: porRpc[nombre], error: null }))
  select.mockResolvedValue({ data: normativas, error: null })
  from.mockReturnValue({ select })
})

describe('obtenerMetricas', () => {
  it('llama a cada RPC con p_desde y p_hasta', async () => {
    await obtenerMetricas(periodo)
    for (const nombre of [
      'metricas_resumen',
      'metricas_por_taller',
      'metricas_por_nivel',
      'metricas_por_cargo',
      'metricas_por_localidad',
    ]) {
      expect(rpc).toHaveBeenCalledWith(nombre, { p_desde: '2026-03-10', p_hasta: '2026-03-12' })
    }
  })

  it('metricas_por_periodo recibe además p_por_mes', async () => {
    await obtenerMetricas({ ...periodo, porMes: true })
    expect(rpc).toHaveBeenCalledWith('metricas_por_periodo', {
      p_desde: '2026-03-10',
      p_hasta: '2026-03-12',
      p_por_mes: true,
    })
    await obtenerMetricas(periodo)
    expect(rpc).toHaveBeenCalledWith('metricas_por_periodo', expect.objectContaining({ p_por_mes: false }))
  })

  it('hace exactamente seis llamadas rpc', async () => {
    await obtenerMetricas(periodo)
    expect(rpc).toHaveBeenCalledTimes(6)
  })

  it('lee las normativas con un select directo de la tabla normativa, incluyendo descargas', async () => {
    await obtenerMetricas(periodo)
    expect(from).toHaveBeenCalledWith('normativa')
    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.calls[0][0]).toEqual(expect.stringContaining('descargas'))
  })

  it('devuelve cada resultado en su campo, con el resumen como una sola fila', async () => {
    const r = await obtenerMetricas(periodo)
    expect(r).toEqual({ resumen, serie, talleres, niveles, cargos, localidades, normativas })
  })

  it.each(Object.keys(porRpc))('lanza si la RPC %s devuelve { error }', async (cual) => {
    const error = Object.assign(new Error('boom'), { code: '42501' })
    rpc.mockImplementation(async (nombre: string) =>
      nombre === cual ? { data: null, error } : { data: porRpc[nombre], error: null },
    )
    await expect(obtenerMetricas(periodo)).rejects.toMatchObject({ code: '42501' })
  })

  it.each(Object.keys(porRpc))('lanza si la RPC %s rechaza', async (cual) => {
    rpc.mockImplementation(async (nombre: string) => {
      if (nombre === cual) throw new Error('sin red')
      return { data: porRpc[nombre], error: null }
    })
    await expect(obtenerMetricas(periodo)).rejects.toThrow('sin red')
  })

  it('lanza si el select de normativas devuelve { error }', async () => {
    select.mockResolvedValue({ data: null, error: Object.assign(new Error('RLS'), { code: '42501' }) })
    await expect(obtenerMetricas(periodo)).rejects.toMatchObject({ code: '42501' })
  })

  it('lanza si el select de normativas rechaza', async () => {
    select.mockRejectedValue(new Error('sin red'))
    await expect(obtenerMetricas(periodo)).rejects.toThrow('sin red')
  })

  it('lanza si metricas_resumen no devuelve ninguna fila (no inventa ceros)', async () => {
    rpc.mockImplementation(async (nombre: string) => ({
      data: nombre === 'metricas_resumen' ? [] : porRpc[nombre],
      error: null,
    }))
    await expect(obtenerMetricas(periodo)).rejects.toThrow()
  })
})
