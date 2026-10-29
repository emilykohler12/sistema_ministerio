import { describe, expect, it } from 'vitest'
import {
  ZONA_ARGENTINA,
  diasEntre,
  fechaAIso,
  fechaReal,
  formatFechaHoraArgentina,
  formatMes,
  sumarDias,
} from './date'

describe('ZONA_ARGENTINA', () => {
  it('es la zona IANA de Buenos Aires', () => {
    expect(ZONA_ARGENTINA).toBe('America/Argentina/Buenos_Aires')
  })
})

/*
 * fechaReal(iso: string): Date | null
 *   `AAAA-MM-DD` real (día existente, año >= 1) como Date a medianoche UTC; null si no.
 * fechaAIso(fecha: Date): string       Date UTC -> `AAAA-MM-DD` con el año de 4 dígitos.
 * sumarDias(iso: string, n: number): string
 * diasEntre(desdeIso, hastaIso): number   días entre dos fechas válidas (hasta - desde).
 */
describe('fechaReal', () => {
  it('devuelve la fecha a medianoche UTC', () => {
    expect(fechaReal('2026-03-10')?.toISOString()).toBe('2026-03-10T00:00:00.000Z')
  })

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-03-00', '2026-04-31', '2025-02-29'])(
    'rechaza el día inexistente %s',
    (valor) => {
      expect(fechaReal(valor)).toBeNull()
    },
  )

  it('acepta el 29/02 de un año bisiesto', () => {
    expect(fechaReal('2028-02-29')?.toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  it.each(['hola', '', '2026-3-1', '10/03/2026', '2026-03-10T00:00', ' 2026-03-10'])(
    'rechaza el formato %j',
    (valor) => {
      expect(fechaReal(valor)).toBeNull()
    },
  )

  it('rechaza el año 0000 (Postgres no lo tiene)', () => {
    expect(fechaReal('0000-01-01')).toBeNull()
  })

  it('el año 0001 no se toma como 1901', () => {
    expect(fechaReal('0001-01-01')?.getUTCFullYear()).toBe(1)
  })
})

describe('fechaAIso', () => {
  it('ida y vuelta con fechaReal', () => {
    expect(fechaAIso(fechaReal('2026-03-10') as Date)).toBe('2026-03-10')
  })

  it('rellena el año a 4 dígitos', () => {
    expect(fechaAIso(fechaReal('0001-01-01') as Date)).toBe('0001-01-01')
  })
})

describe('sumarDias', () => {
  it('suma dentro del mes', () => {
    expect(sumarDias('2026-03-10', 5)).toBe('2026-03-15')
  })

  it('cruza el fin de mes', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01')
    expect(sumarDias('2026-03-31', 1)).toBe('2026-04-01')
  })

  it('cruza el fin de año', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('respeta el 29/02 de un año bisiesto', () => {
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(sumarDias('2028-02-29', 1)).toBe('2028-03-01')
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('resta con un número negativo', () => {
    expect(sumarDias('2026-10-16', -29)).toBe('2026-09-17')
    expect(sumarDias('2027-01-01', -1)).toBe('2026-12-31')
  })
})

describe('diasEntre', () => {
  it('es 0 para el mismo día y cuenta días corridos', () => {
    expect(diasEntre('2026-03-10', '2026-03-10')).toBe(0)
    expect(diasEntre('2026-01-01', '2026-04-02')).toBe(91)
  })

  it('es negativo si hasta es anterior a desde', () => {
    expect(diasEntre('2026-03-12', '2026-03-10')).toBe(-2)
  })
})

describe('formatMes', () => {
  it('devuelve el mes en letras y el año', () => {
    expect(formatMes('2026-10-01')).toBe('octubre de 2026')
  })

  it('interpreta la fecha como local: el primero de enero no pasa a diciembre', () => {
    expect(formatMes('2026-01-01')).toBe('enero de 2026')
  })

  it('el último día del mes sigue en ese mes', () => {
    expect(formatMes('2026-03-31')).toBe('marzo de 2026')
  })
})

/*
 * formatFechaHoraArgentina(timestampIso: string): string
 *   Fecha y hora en hora de Argentina (Intl, timeZone America/Argentina/Buenos_Aires), sin depender de la zona del navegador.
 *   El formato exacto lo decide Intl: el test fija día/mes/año con "/" y la hora HH:mm.
 */
describe('formatFechaHoraArgentina', () => {
  it('convierte UTC a hora de Argentina (UTC-3): 01:30Z es 22:30 del día anterior', () => {
    const r = formatFechaHoraArgentina('2026-10-16T01:30:00Z')
    expect(r).toMatch(/15\/10\/(20)?26/)
    expect(r).toContain('22:30')
  })

  it('un timestamp con offset se expresa en Argentina, no en UTC', () => {
    const r = formatFechaHoraArgentina('2026-10-16T23:30:00-03:00')
    expect(r).toMatch(/16\/10\/(20)?26/)
    expect(r).toContain('23:30')
  })

  it('el mediodía UTC es 09:00 en Argentina', () => {
    const r = formatFechaHoraArgentina('2026-01-05T12:00:00Z')
    expect(r).toMatch(/5\/1\/(20)?26|05\/01\/(20)?26/)
    expect(r).toContain('09:00')
  })

  it('en pleno invierno del hemisferio norte sigue siendo UTC-3 (Argentina no usa horario de verano)', () => {
    const r = formatFechaHoraArgentina('2026-07-01T03:00:00Z')
    expect(r).toMatch(/0?1\/0?7\/(20)?26/)
    expect(r).toContain('00:00')
  })
})
