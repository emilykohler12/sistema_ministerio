import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FECHA_MINIMA,
  hoyArgentina,
  parametrosDePeriodo,
  periodoDesdeUrl,
  validarPeriodo,
  type Periodo,
} from './periodo'

/*
 * Contrato de periodo.ts (puro; spec criterio 1, crítica 6 y 13). Exporta:
 *   type TipoPeriodo = '30d' | 'anio' | 'rango'
 *   interface Periodo { tipo: TipoPeriodo; desde: string; hasta: string; porMes: boolean }   // fechas AAAA-MM-DD
 *   const FECHA_MINIMA = '2020-01-01'
 *   hoyArgentina(ahora?: Date): string               // fecha local America/Argentina/Buenos_Aires; ahora = new Date() por defecto
 *   periodoDesdeUrl(params: URLSearchParams): Periodo
 *     - sin `periodo`, o `periodo` desconocido -> 30 días
 *     - 'rango' sin `desde` o `hasta` con formato AAAA-MM-DD válido (fecha real) -> 30 días
 *     - 'rango' con ambas fechas bien formadas -> se respeta tal cual, aunque estén fuera de tope (lo marca validarPeriodo)
 *   parametrosDePeriodo(periodo: Periodo): URLSearchParams    // '30d' -> periodo=30d · 'anio' -> periodo=anio · 'rango' -> periodo, desde, hasta
 *   validarPeriodo(periodo: Periodo, ahora?: Date): string | null   // mensaje de error en español o null si es válido
 * El reloj se inyecta con vi.setSystemTime (solo se falsea Date).
 */
function fijarAhora(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

beforeEach(() => fijarAhora('2026-10-16T15:00:00Z'))
afterEach(() => vi.useRealTimers())

const q = (s: string) => new URLSearchParams(s)

describe('hoyArgentina', () => {
  it('devuelve la fecha local en hora de Argentina', () => {
    expect(hoyArgentina()).toBe('2026-10-16')
  })

  it('las 22:00 de Argentina (01:00 UTC del día siguiente) siguen siendo el mismo día', () => {
    fijarAhora('2026-10-17T01:00:00Z')
    expect(hoyArgentina()).toBe('2026-10-16')
  })

  it('las 00:00 de Argentina (03:00 UTC) ya son el día nuevo', () => {
    fijarAhora('2026-10-17T03:00:00Z')
    expect(hoyArgentina()).toBe('2026-10-17')
  })

  it('cruza el año con la hora local, no con la UTC', () => {
    fijarAhora('2027-01-01T01:00:00Z')
    expect(hoyArgentina()).toBe('2026-12-31')
  })

  it('acepta un reloj inyectado', () => {
    expect(hoyArgentina(new Date('2025-02-03T12:00:00Z'))).toBe('2025-02-03')
  })
})

describe('periodoDesdeUrl', () => {
  it('sin parámetros usa los últimos 30 días: [hoy-29, hoy], por día', () => {
    expect(periodoDesdeUrl(q(''))).toEqual({
      tipo: '30d',
      desde: '2026-09-17',
      hasta: '2026-10-16',
      porMes: false,
    })
  })

  it('periodo=30d usa [hoy-29, hoy] contando el día de hoy', () => {
    const p = periodoDesdeUrl(q('periodo=30d'))
    expect(p.desde).toBe('2026-09-17')
    expect(p.hasta).toBe('2026-10-16')
  })

  it('los 30 días usan el "hoy" de Argentina a las 22:00 locales', () => {
    fijarAhora('2026-10-17T01:00:00Z')
    const p = periodoDesdeUrl(q('periodo=30d'))
    expect(p.hasta).toBe('2026-10-16')
    expect(p.desde).toBe('2026-09-17')
  })

  it('los 30 días cruzan el cambio de mes y de año', () => {
    fijarAhora('2027-01-10T15:00:00Z')
    expect(periodoDesdeUrl(q('periodo=30d')).desde).toBe('2026-12-12')
  })

  it('periodo=anio va del 1 de enero a hoy y se agrupa por mes', () => {
    expect(periodoDesdeUrl(q('periodo=anio'))).toEqual({
      tipo: 'anio',
      desde: '2026-01-01',
      hasta: '2026-10-16',
      porMes: true,
    })
  })

  it('el año en curso se ve por día mientras dure 92 días o menos y por mes después', () => {
    fijarAhora('2026-04-02T15:00:00Z') // 1/ene..2/abr = 92 días
    expect(periodoDesdeUrl(q('periodo=anio')).porMes).toBe(false)
    fijarAhora('2026-04-03T15:00:00Z') // 93 días
    expect(periodoDesdeUrl(q('periodo=anio')).porMes).toBe(true)
  })

  it('el año en curso usa el año local: el 1/1 a las 00:30 UTC todavía es el año anterior', () => {
    fijarAhora('2027-01-01T00:30:00Z')
    const p = periodoDesdeUrl(q('periodo=anio'))
    expect(p.desde).toBe('2026-01-01')
    expect(p.hasta).toBe('2026-12-31')
  })

  it('periodo=rango con fechas válidas las respeta', () => {
    expect(periodoDesdeUrl(q('periodo=rango&desde=2026-03-10&hasta=2026-03-12'))).toEqual({
      tipo: 'rango',
      desde: '2026-03-10',
      hasta: '2026-03-12',
      porMes: false,
    })
  })

  it('un rango de exactamente 92 días va por día y uno de 93 va por mes', () => {
    expect(periodoDesdeUrl(q('periodo=rango&desde=2026-01-01&hasta=2026-04-02')).porMes).toBe(false)
    expect(periodoDesdeUrl(q('periodo=rango&desde=2026-01-01&hasta=2026-04-03')).porMes).toBe(true)
  })

  it('un rango de un solo día (desde = hasta) se acepta', () => {
    const p = periodoDesdeUrl(q('periodo=rango&desde=2026-03-10&hasta=2026-03-10'))
    expect(p.tipo).toBe('rango')
    expect(p.porMes).toBe(false)
  })

  it.each([
    ['un periodo desconocido', 'periodo=semana'],
    ['un periodo vacío', 'periodo='],
    ['rango sin fechas', 'periodo=rango'],
    ['rango sin hasta', 'periodo=rango&desde=2026-03-10'],
    ['rango sin desde', 'periodo=rango&hasta=2026-03-10'],
    ['rango con fechas mal formadas', 'periodo=rango&desde=hoy&hasta=ayer'],
    ['rango con formato DD/MM/AAAA', 'periodo=rango&desde=10/03/2026&hasta=12/03/2026'],
    ['rango con una fecha inexistente', 'periodo=rango&desde=2026-02-31&hasta=2026-03-10'],
  ])('%s cae a los 30 días', (_nombre, qs) => {
    expect(periodoDesdeUrl(q(qs))).toEqual({
      tipo: '30d',
      desde: '2026-09-17',
      hasta: '2026-10-16',
      porMes: false,
    })
  })

  it('un rango bien formado pero fuera de tope no cae a 30 días: se conserva para mostrar el error', () => {
    const p = periodoDesdeUrl(q('periodo=rango&desde=2026-03-12&hasta=2026-03-10'))
    expect(p.tipo).toBe('rango')
    expect(p.desde).toBe('2026-03-12')
    expect(p.hasta).toBe('2026-03-10')
  })
})

describe('parametrosDePeriodo', () => {
  it('30d y año llevan solo el tipo', () => {
    const treinta = parametrosDePeriodo(periodoDesdeUrl(q('periodo=30d')))
    expect(treinta.get('periodo')).toBe('30d')
    expect(treinta.has('desde')).toBe(false)
    const anio = parametrosDePeriodo(periodoDesdeUrl(q('periodo=anio')))
    expect(anio.get('periodo')).toBe('anio')
    expect(anio.has('hasta')).toBe(false)
  })

  it('rango lleva periodo, desde y hasta', () => {
    const p: Periodo = { tipo: 'rango', desde: '2026-03-10', hasta: '2026-03-12', porMes: false }
    const params = parametrosDePeriodo(p)
    expect(params.get('periodo')).toBe('rango')
    expect(params.get('desde')).toBe('2026-03-10')
    expect(params.get('hasta')).toBe('2026-03-12')
  })

  it('ida y vuelta: URL -> periodo -> URL -> periodo da lo mismo', () => {
    const original = periodoDesdeUrl(q('periodo=rango&desde=2026-03-10&hasta=2026-03-12'))
    expect(periodoDesdeUrl(parametrosDePeriodo(original))).toEqual(original)
  })
})

describe('validarPeriodo', () => {
  const rango = (desde: string, hasta: string): Periodo => ({ tipo: 'rango', desde, hasta, porMes: false })

  it('FECHA_MINIMA es 2020-01-01', () => {
    expect(FECHA_MINIMA).toBe('2020-01-01')
  })

  it('un rango dentro de [2020-01-01, hoy] es válido', () => {
    expect(validarPeriodo(rango('2026-03-10', '2026-03-12'))).toBeNull()
  })

  it('los extremos 2020-01-01 y hoy son válidos', () => {
    expect(validarPeriodo(rango('2020-01-01', '2026-10-16'))).toBeNull()
  })

  it('desde = hasta es válido', () => {
    expect(validarPeriodo(rango('2026-10-16', '2026-10-16'))).toBeNull()
  })

  it('desde posterior a hasta devuelve un mensaje', () => {
    expect(validarPeriodo(rango('2026-03-12', '2026-03-10'))).toEqual(expect.any(String))
    expect(validarPeriodo(rango('2026-03-12', '2026-03-10'))).not.toBe('')
  })

  it('desde anterior a 2020-01-01 devuelve un mensaje', () => {
    expect(validarPeriodo(rango('2019-12-31', '2026-03-10'))).toEqual(expect.any(String))
  })

  it('un año 0001 devuelve un mensaje', () => {
    expect(validarPeriodo(rango('0001-01-01', '2026-03-10'))).toEqual(expect.any(String))
  })

  it('hasta posterior a hoy devuelve un mensaje', () => {
    expect(validarPeriodo(rango('2026-03-10', '2026-10-17'))).toEqual(expect.any(String))
    expect(validarPeriodo(rango('2026-03-10', '9999-12-31'))).toEqual(expect.any(String))
  })

  it('hoy se mide en Argentina: a las 22:00 locales, hasta = hoy sigue siendo válido y mañana no', () => {
    fijarAhora('2026-10-17T01:00:00Z')
    expect(validarPeriodo(rango('2026-10-01', '2026-10-16'))).toBeNull()
    expect(validarPeriodo(rango('2026-10-01', '2026-10-17'))).toEqual(expect.any(String))
  })

  it('los preajustes 30d y año en curso siempre son válidos', () => {
    expect(validarPeriodo(periodoDesdeUrl(q('periodo=30d')))).toBeNull()
    expect(validarPeriodo(periodoDesdeUrl(q('periodo=anio')))).toBeNull()
  })
})
