import { describe, expect, it } from 'vitest'
import { formatearRestante, mensajeRestante } from './restante'

describe('formatearRestante', () => {
  it.each([
    [120_000, '2:00'],
    [119_000, '1:59'],
    [118_001, '1:59'],
    [61_000, '1:01'],
    [9_000, '0:09'],
    [0, '0:00'],
    [-500, '0:00'],
  ])('%i ms se muestra como %s', (ms, esperado) => {
    expect(formatearRestante(ms)).toBe(esperado)
  })
})

describe('mensajeRestante', () => {
  it.each([
    [120_000, 'Quedan 2 minutos para que se cierre tu sesión.'],
    [61_000, 'Quedan 2 minutos para que se cierre tu sesión.'],
    [60_000, 'Queda 1 minuto para que se cierre tu sesión.'],
    [31_000, 'Queda 1 minuto para que se cierre tu sesión.'],
    [30_000, 'Quedan 30 segundos para que se cierre tu sesión.'],
    [11_000, 'Quedan 30 segundos para que se cierre tu sesión.'],
    [10_000, 'Quedan 10 segundos para que se cierre tu sesión.'],
    [0, 'Quedan 10 segundos para que se cierre tu sesión.'],
  ])('con %i ms dice "%s"', (ms, esperado) => {
    expect(mensajeRestante(ms)).toBe(esperado)
  })
})
