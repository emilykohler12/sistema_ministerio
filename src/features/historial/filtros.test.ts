import { describe, expect, it } from 'vitest'
import {
  FILTROS_VACIOS,
  TAMANIO_PAGINA,
  filtrosAUrl,
  filtrosDesdeUrl,
  hayFiltros,
  limitesDelDia,
  validarFiltros,
  type FiltrosHistorial,
} from './filtros'

/*
 * Contrato (spec criterios 3 y 4; crítica 6 y 8, respuesta):
 *   interface FiltrosHistorial {
 *     desde: string | null; hasta: string | null    // AAAA-MM-DD
 *     usuario: string | null                         // uuid o 'sistema'
 *     entidad: string | null                         // valor de ENTIDADES_FILTRABLES
 *     pagina: number                                 // entero >= 1
 *   }
 *   FILTROS_VACIOS: FiltrosHistorial (todo null, pagina 1)         TAMANIO_PAGINA = 50
 *   filtrosDesdeUrl(params: URLSearchParams): FiltrosHistorial
 *     - descarta lo inválido: usuario que no es uuid ni 'sistema', entidad desconocida, pagina que no es entero >= 1 (-> 1).
 *     - las fechas se conservan tal cual (una mal formada la reporta validarFiltros); '' -> null.
 *   filtrosAUrl(f): URLSearchParams    // omite nulos y pagina 1; claves desde, hasta, usuario, entidad, pagina
 *   validarFiltros(f): string | null   // mensaje de error o null. Solo: fecha mal formada/irreal y desde > hasta.
 *   limitesDelDia(f): { desde: string | null; hastaExclusivo: string | null }
 *     // `<desde>T00:00:00-03:00` y `<hasta + 1 día>T00:00:00-03:00`
 *   hayFiltros(f): boolean             // ¿hay desde, hasta, usuario o entidad? (la página no cuenta)
 */
const UUID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const f = (p: Partial<FiltrosHistorial> = {}): FiltrosHistorial => ({ ...FILTROS_VACIOS, ...p })
const url = (q: string) => filtrosDesdeUrl(new URLSearchParams(q))

describe('constantes', () => {
  it('FILTROS_VACIOS no filtra y está en la página 1; el tamaño de página es 50', () => {
    expect(FILTROS_VACIOS).toEqual({
      desde: null,
      hasta: null,
      usuario: null,
      entidad: null,
      pagina: 1,
    })
    expect(TAMANIO_PAGINA).toBe(50)
  })
})

describe('filtrosDesdeUrl', () => {
  it('sin parámetros devuelve los filtros vacíos', () => {
    expect(url('')).toEqual(FILTROS_VACIOS)
  })

  it('lee todos los parámetros válidos', () => {
    expect(url(`desde=2026-03-10&hasta=2026-03-12&usuario=${UUID}&entidad=taller&pagina=3`)).toEqual({
      desde: '2026-03-10',
      hasta: '2026-03-12',
      usuario: UUID,
      entidad: 'taller',
      pagina: 3,
    })
  })

  it('acepta usuario=sistema', () => {
    expect(url('usuario=sistema').usuario).toBe('sistema')
  })

  it.each(['x', 'sistema2', '123', '3f2b8c1e-9a4d-4e6f-8b7a', `${UUID}0`, "'; drop table x;--"])(
    'descarta un usuario inválido (%s)',
    (v) => {
      expect(url(`usuario=${encodeURIComponent(v)}`).usuario).toBeNull()
    },
  )

  it('descarta una entidad desconocida', () => {
    expect(url('entidad=inventada').entidad).toBeNull()
    expect(url('entidad=nivel_educativo').entidad).toBeNull()
  })

  it.each(['0', '-1', 'abc', '1.5', '2abc', '', ' ', 'NaN', '1e3'])('una página inválida (%s) vuelve a 1', (v) => {
    expect(url(`pagina=${encodeURIComponent(v)}`).pagina).toBe(1)
  })

  it('acepta cualquier entero >= 1', () => {
    expect(url('pagina=1').pagina).toBe(1)
    expect(url('pagina=999').pagina).toBe(999)
  })

  it('conserva una fecha mal formada para que validarFiltros la reporte, y una vacía es null', () => {
    expect(url('desde=hola').desde).toBe('hola')
    expect(url('desde=&hasta=').desde).toBeNull()
    expect(url('desde=&hasta=').hasta).toBeNull()
  })
})

describe('filtrosAUrl', () => {
  it('con filtros vacíos no escribe nada', () => {
    expect(filtrosAUrl(FILTROS_VACIOS).toString()).toBe('')
  })

  it('omite la página 1 y escribe las demás claves', () => {
    const p = filtrosAUrl(f({ desde: '2026-03-10', usuario: 'sistema', entidad: 'taller', pagina: 2 }))
    expect(p.get('desde')).toBe('2026-03-10')
    expect(p.get('hasta')).toBeNull()
    expect(p.get('usuario')).toBe('sistema')
    expect(p.get('entidad')).toBe('taller')
    expect(p.get('pagina')).toBe('2')
    expect(filtrosAUrl(f({ pagina: 1 })).has('pagina')).toBe(false)
  })

  it('ida y vuelta con la URL', () => {
    const original = f({
      desde: '2026-03-10',
      hasta: '2026-03-12',
      usuario: UUID,
      entidad: 'normativa',
      pagina: 4,
    })
    expect(filtrosDesdeUrl(filtrosAUrl(original))).toEqual(original)
  })
})

describe('validarFiltros', () => {
  it('sin fechas es válido', () => {
    expect(validarFiltros(f())).toBeNull()
  })

  it('con solo desde o solo hasta es válido', () => {
    expect(validarFiltros(f({ desde: '2026-03-10' }))).toBeNull()
    expect(validarFiltros(f({ hasta: '2026-03-10' }))).toBeNull()
  })

  it('desde igual a hasta es válido (un día)', () => {
    expect(validarFiltros(f({ desde: '2026-03-10', hasta: '2026-03-10' }))).toBeNull()
  })

  it('desde posterior a hasta da un mensaje', () => {
    const mensaje = validarFiltros(f({ desde: '2026-03-12', hasta: '2026-03-10' }))
    expect(mensaje).toEqual(expect.any(String))
    expect(mensaje).not.toBe('')
  })

  it.each(['hola', '2026-3-1', '10/03/2026', '2026-13-01', '2026-02-30', '2026-03-10T00:00', '0000-01-01'])(
    'una fecha mal formada o irreal (%s) da un mensaje, en desde y en hasta',
    (v) => {
      expect(validarFiltros(f({ desde: v }))).toEqual(expect.any(String))
      expect(validarFiltros(f({ hasta: v }))).toEqual(expect.any(String))
    },
  )

  it('no impone topes: un hasta futuro y un desde de 2019 son válidos (no hay RPC que los rechace)', () => {
    expect(validarFiltros(f({ desde: '2019-01-01', hasta: '9999-12-31' }))).toBeNull()
  })
})

describe('limitesDelDia', () => {
  it('sin fechas no hay límites', () => {
    expect(limitesDelDia(f())).toEqual({ desde: null, hastaExclusivo: null })
  })

  it('desde es la medianoche de Argentina y hasta es la medianoche del día siguiente', () => {
    expect(limitesDelDia(f({ desde: '2026-03-10', hasta: '2026-03-12' }))).toEqual({
      desde: '2026-03-10T00:00:00-03:00',
      hastaExclusivo: '2026-03-13T00:00:00-03:00',
    })
  })

  it('el día siguiente cruza fin de mes y de año', () => {
    expect(limitesDelDia(f({ hasta: '2026-03-31' })).hastaExclusivo).toBe('2026-04-01T00:00:00-03:00')
    expect(limitesDelDia(f({ hasta: '2026-12-31' })).hastaExclusivo).toBe('2027-01-01T00:00:00-03:00')
  })

  it('respeta febrero bisiesto', () => {
    expect(limitesDelDia(f({ hasta: '2028-02-28' })).hastaExclusivo).toBe('2028-02-29T00:00:00-03:00')
    expect(limitesDelDia(f({ hasta: '2026-02-28' })).hastaExclusivo).toBe('2026-03-01T00:00:00-03:00')
  })

  it('con solo un extremo, el otro es null', () => {
    expect(limitesDelDia(f({ desde: '2026-03-10' }))).toEqual({
      desde: '2026-03-10T00:00:00-03:00',
      hastaExclusivo: null,
    })
    expect(limitesDelDia(f({ hasta: '2026-03-10' }))).toEqual({
      desde: null,
      hastaExclusivo: '2026-03-11T00:00:00-03:00',
    })
  })
})

describe('hayFiltros', () => {
  it('la página no cuenta como filtro', () => {
    expect(hayFiltros(f({ pagina: 5 }))).toBe(false)
  })

  it.each([{ desde: '2026-03-10' }, { hasta: '2026-03-10' }, { usuario: 'sistema' }, { entidad: 'taller' }])(
    'detecta %o',
    (p) => {
      expect(hayFiltros(f(p))).toBe(true)
    },
  )
})
