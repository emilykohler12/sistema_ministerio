import { describe, expect, it } from 'vitest'
import { formatMes } from './date'

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
