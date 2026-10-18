import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerHistorial, obtenerUsuariosHistorial } from './consultas'
import { FILTROS_VACIOS, type FiltrosHistorial } from './filtros'
import type { Operacion, UsuarioHistorial } from './types'

/*
 * Contrato (spec Diseño, critica 2 y 7), src/features/historial/consultas.ts, solo supabase:
 *   obtenerHistorial(filtros: FiltrosHistorial): Promise<{ filas: Operacion[]; total: number | null }>
 *     supabase.from('registro_operacion').select('*', { count: 'exact' })
 *       .gte('fecha_hora', <desde>T00:00:00-03:00) / .lt('fecha_hora', <hasta + 1 día>T00:00:00-03:00)   (solo si hay fecha)
 *       .eq('usuario_id', uuid)  |  .is('usuario_id', null) para 'sistema'                               (nunca .eq con null)
 *       .in('tabla', tablasDeEntidad(entidad))                                                             (solo si hay entidad)
 *       .order('id', { ascending: false }).range((p - 1) * 50, p * 50 - 1)
 *     - lanza el error de la consulta (conserva `code`); propaga el rechazo de supabase-js.
 *     - error PGRST103 (página fuera de rango con count exacto) -> { filas: [], total: null } (no lanza).
 *   obtenerUsuariosHistorial(): Promise<UsuarioHistorial[]>   // supabase.rpc('usuarios_historial'), lanza el error de la RPC
 */
const { from, rpc, llamadas, resultado } = vi.hoisted(() => {
  const llamadas: { metodo: string; args: unknown[] }[] = []
  const resultado: { valor: unknown; rechazo?: unknown } = {
    valor: { data: [], error: null, count: 0 },
  }
  const builder: Record<string, unknown> = {}
  for (const metodo of ['select', 'gte', 'lt', 'eq', 'is', 'in', 'order', 'range']) {
    builder[metodo] = (...args: unknown[]) => {
      llamadas.push({ metodo, args })
      return builder
    }
  }
  builder.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
    (resultado.rechazo ? Promise.reject(resultado.rechazo) : Promise.resolve(resultado.valor)).then(ok, ko)
  const from = vi.fn(() => builder)
  const rpc = vi.fn()
  return { from, rpc, llamadas, resultado }
})
vi.mock('@/shared/lib/supabase', () => ({ supabase: { from, rpc } }))

const UUID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const f = (p: Partial<FiltrosHistorial> = {}): FiltrosHistorial => ({ ...FILTROS_VACIOS, ...p })
const de = (metodo: string) => llamadas.filter((l) => l.metodo === metodo)

const fila: Operacion = {
  id: 9,
  usuario_id: UUID,
  operacion: 'INSERT',
  tabla: 'taller',
  registro_id: '7',
  datos_anteriores: null,
  datos_nuevos: { id: 7, nombre: 'A' },
  fecha_hora: '2026-10-16T12:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  llamadas.length = 0
  resultado.valor = { data: [fila], error: null, count: 120 }
  resultado.rechazo = undefined
})

describe('obtenerHistorial', () => {
  it('lee la tabla registro_operacion pidiendo el conteo exacto', async () => {
    await obtenerHistorial(f())
    expect(from).toHaveBeenCalledWith('registro_operacion')
    expect(de('select')[0].args[1]).toEqual(expect.objectContaining({ count: 'exact' }))
  })

  it('devuelve las filas y el total', async () => {
    await expect(obtenerHistorial(f())).resolves.toEqual({ filas: [fila], total: 120 })
  })

  it('ordena por id descendente (las filas de una misma transacción comparten fecha_hora)', async () => {
    await obtenerHistorial(f())
    expect(de('order')).toHaveLength(1)
    expect(de('order')[0].args[0]).toBe('id')
    expect(de('order')[0].args[1]).toEqual({ ascending: false })
  })

  it('sin filtros no aplica ningún filtro, y la página 1 es el rango 0-49', async () => {
    await obtenerHistorial(f())
    for (const m of ['gte', 'lt', 'eq', 'is', 'in']) expect(de(m)).toHaveLength(0)
    expect(de('range')[0].args).toEqual([0, 49])
  })

  it.each([
    [1, 0, 49],
    [2, 50, 99],
    [3, 100, 149],
    [10, 450, 499],
  ])('la página %i pide el rango inclusivo %i-%i', async (pagina, desde, hasta) => {
    await obtenerHistorial(f({ pagina }))
    expect(de('range')[0].args).toEqual([desde, hasta])
  })

  it('desde y hasta son límites del día en Argentina: gte medianoche de desde y lt medianoche del día siguiente a hasta', async () => {
    await obtenerHistorial(f({ desde: '2026-03-10', hasta: '2026-03-12' }))
    expect(de('gte')).toHaveLength(1)
    expect(de('gte')[0].args).toEqual(['fecha_hora', '2026-03-10T00:00:00-03:00'])
    expect(de('lt')).toHaveLength(1)
    expect(de('lt')[0].args).toEqual(['fecha_hora', '2026-03-13T00:00:00-03:00'])
  })

  it('con solo hasta no aplica gte, y con solo desde no aplica lt', async () => {
    await obtenerHistorial(f({ hasta: '2026-03-12' }))
    expect(de('gte')).toHaveLength(0)
    expect(de('lt')).toHaveLength(1)
    llamadas.length = 0
    await obtenerHistorial(f({ desde: '2026-03-10' }))
    expect(de('gte')).toHaveLength(1)
    expect(de('lt')).toHaveLength(0)
  })

  it('un usuario uuid filtra con .eq("usuario_id", uuid)', async () => {
    await obtenerHistorial(f({ usuario: UUID }))
    expect(de('eq')).toHaveLength(1)
    expect(de('eq')[0].args).toEqual(['usuario_id', UUID])
    expect(de('is')).toHaveLength(0)
  })

  it('"sistema" filtra con .is("usuario_id", null) y no con .eq', async () => {
    await obtenerHistorial(f({ usuario: 'sistema' }))
    expect(de('is')).toHaveLength(1)
    expect(de('is')[0].args).toEqual(['usuario_id', null])
    expect(de('eq')).toHaveLength(0)
  })

  it('una entidad filtra con .in("tabla", sus tablas): Taller incluye las puentes', async () => {
    await obtenerHistorial(f({ entidad: 'taller' }))
    expect(de('in')).toHaveLength(1)
    expect(de('in')[0].args[0]).toBe('tabla')
    expect([...(de('in')[0].args[1] as string[])].sort()).toEqual(['taller', 'taller_destinatario', 'taller_etiqueta'])
  })

  it('combina todos los filtros', async () => {
    await obtenerHistorial(
      f({
        desde: '2026-03-10',
        hasta: '2026-03-12',
        usuario: UUID,
        entidad: 'categoria',
        pagina: 2,
      }),
    )
    expect(de('gte')).toHaveLength(1)
    expect(de('lt')).toHaveLength(1)
    expect(de('eq')).toHaveLength(1)
    expect(de('in')[0].args).toEqual(['tabla', ['categoria']])
    expect(de('range')[0].args).toEqual([50, 99])
  })

  it('lanza el error de la consulta conservando el code', async () => {
    resultado.valor = {
      data: null,
      error: { code: '42501', message: 'permission denied' },
      count: null,
    }
    await expect(obtenerHistorial(f())).rejects.toMatchObject({ code: '42501' })
  })

  it('propaga el rechazo de supabase-js (red)', async () => {
    resultado.rechazo = new Error('sin red')
    await expect(obtenerHistorial(f())).rejects.toThrow('sin red')
  })

  it('PGRST103 (página fuera de rango) no es un error: devuelve una página vacía', async () => {
    resultado.valor = {
      data: null,
      error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
      count: null,
    }
    await expect(obtenerHistorial(f({ pagina: 9 }))).resolves.toEqual({ filas: [], total: null })
  })

  it('otro error de PostgREST sí lanza', async () => {
    resultado.valor = {
      data: null,
      error: { code: 'PGRST301', message: 'jwt expired' },
      count: null,
    }
    await expect(obtenerHistorial(f())).rejects.toMatchObject({ code: 'PGRST301' })
  })

  it('sin filas devuelve [] y el total 0', async () => {
    resultado.valor = { data: [], error: null, count: 0 }
    await expect(obtenerHistorial(f())).resolves.toEqual({ filas: [], total: 0 })
  })
})

describe('obtenerUsuariosHistorial', () => {
  const usuarios: UsuarioHistorial[] = [{ id: UUID, email: 'admin@dam.local' }]

  it('llama a la RPC usuarios_historial y devuelve los usuarios', async () => {
    rpc.mockResolvedValue({ data: usuarios, error: null })
    await expect(obtenerUsuariosHistorial()).resolves.toEqual(usuarios)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('usuarios_historial')
  })

  it('lanza el error de la RPC conservando el code', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(obtenerUsuariosHistorial()).rejects.toMatchObject({ code: '42501' })
  })

  it('propaga el rechazo de supabase-js (red)', async () => {
    rpc.mockRejectedValue(new Error('sin red'))
    await expect(obtenerUsuariosHistorial()).rejects.toThrow('sin red')
  })
})
