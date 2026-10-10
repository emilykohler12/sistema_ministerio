import { describe, expect, it } from 'vitest'
import { idDeRuta } from './rutas'

describe('idDeRuta', () => {
  it('devuelve el entero positivo que representa el parámetro', () => {
    expect(idDeRuta('3')).toBe(3)
    expect(idDeRuta('120')).toBe(120)
  })

  it('acepta el máximo de un int de Postgres (2147483647) y rechaza lo que lo supera', () => {
    expect(idDeRuta('2147483647')).toBe(2147483647)
    expect(idDeRuta('2147483648')).toBeNull()
    expect(idDeRuta('99999999999')).toBeNull()
  })

  it('devuelve null si no hay parámetro o no es un entero positivo', () => {
    for (const invalido of [undefined, null, '', 'abc', '0', '-1', '1.5', '1e3', ' 3', '3 ', '03', '9'.repeat(30)]) {
      expect(idDeRuta(invalido)).toBeNull()
    }
  })
})
