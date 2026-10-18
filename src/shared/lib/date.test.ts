import { describe, expect, it } from 'vitest'
import { formatFechaHoraArgentina, formatMes } from './date'

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
