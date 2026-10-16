import { describe, expect, it } from 'vitest'
import {
  cobertura,
  conPorcentajes,
  ordenarLocalidades,
  ordenarNormativas,
  ordenarTalleres,
  porcentaje,
} from './calculos'

/*
 * Contrato de calculos.ts (puro; spec criterios 4, 5, 6 y 7, crítica 3). Exporta:
 *   porcentaje(n: number, total: number): number | null     // 0..100 con 1 decimal; total 0 -> null
 *   cobertura(alcanzados: number, padron: number): number | null   // alcanzados / padron en %, 1 decimal; padron 0 -> null
 *   conPorcentajes<T extends { descargas: number }>(filas: T[]): (T & { porcentaje: number | null })[]
 *     // porcentaje sobre la suma de `descargas` de las filas; suma 0 -> porcentaje null en todas; conserva el orden
 *   ordenarTalleres(filas: { taller_id: number; descargas: number }[]): igual   // descargas desc, luego taller_id asc (no muta)
 *   ordenarLocalidades(filas: { nombre: string; descargas: number }[]): igual   // descargas desc, luego nombre (es-AR, sin tildes) (no muta)
 *   ordenarNormativas(filas: { id: number; descargas: number }[]): igual        // descargas desc, luego id asc (no muta)
 */
describe('porcentaje', () => {
  it('calcula el porcentaje sobre el total con un decimal', () => {
    expect(porcentaje(1, 4)).toBe(25)
    expect(porcentaje(1, 3)).toBe(33.3)
    expect(porcentaje(2, 3)).toBe(66.7)
  })

  it('cero sobre un total positivo es 0', () => {
    expect(porcentaje(0, 10)).toBe(0)
  })

  it('el total entero es 100', () => {
    expect(porcentaje(7, 7)).toBe(100)
  })

  it('con total 0 no hay porcentaje (null, no NaN ni 0)', () => {
    expect(porcentaje(0, 0)).toBeNull()
  })
})

describe('cobertura', () => {
  it('es alcanzados sobre padrón en porcentaje con un decimal', () => {
    expect(cobertura(1, 4)).toBe(25)
    expect(cobertura(2, 3)).toBe(66.7)
    expect(cobertura(5, 5)).toBe(100)
  })

  it('sin alcanzados es 0 si hay padrón', () => {
    expect(cobertura(0, 12)).toBe(0)
  })

  it('con padrón 0 es null, también si hay alcanzados', () => {
    expect(cobertura(0, 0)).toBeNull()
    expect(cobertura(3, 0)).toBeNull()
  })
})

describe('conPorcentajes', () => {
  it('agrega el porcentaje de cada fila sobre la suma y conserva el resto de los campos y el orden', () => {
    const filas = [
      { nombre: 'A', descargas: 1 },
      { nombre: 'B', descargas: 3 },
    ]
    expect(conPorcentajes(filas)).toEqual([
      { nombre: 'A', descargas: 1, porcentaje: 25 },
      { nombre: 'B', descargas: 3, porcentaje: 75 },
    ])
  })

  it('con tres filas iguales cada una da 33,3 (los porcentajes no tienen que sumar 100 exacto)', () => {
    const r = conPorcentajes([{ descargas: 1 }, { descargas: 1 }, { descargas: 1 }])
    expect(r.map((f) => f.porcentaje)).toEqual([33.3, 33.3, 33.3])
  })

  it('con suma 0 todas quedan con porcentaje null', () => {
    const r = conPorcentajes([{ descargas: 0 }, { descargas: 0 }])
    expect(r.map((f) => f.porcentaje)).toEqual([null, null])
  })

  it('una lista vacía da una lista vacía', () => {
    expect(conPorcentajes([])).toEqual([])
  })
})

describe('ordenarTalleres', () => {
  it('ordena por descargas desc y desempata por taller_id asc, sin mutar la entrada', () => {
    const entrada = [
      { taller_id: 9, descargas: 2 },
      { taller_id: 3, descargas: 5 },
      { taller_id: 1, descargas: 2 },
    ]
    const copia = structuredClone(entrada)
    expect(ordenarTalleres(entrada).map((t) => t.taller_id)).toEqual([3, 1, 9])
    expect(entrada).toEqual(copia)
  })
})

describe('ordenarLocalidades', () => {
  it('ordena por descargas desc y desempata por nombre sin distinguir tildes', () => {
    const entrada = [
      { nombre: 'Óberá', descargas: 1 },
      { nombre: 'Posadas', descargas: 4 },
      { nombre: 'Apóstoles', descargas: 1 },
      { nombre: 'Eldorado', descargas: 1 },
    ]
    expect(ordenarLocalidades(entrada).map((l) => l.nombre)).toEqual([
      'Posadas',
      'Apóstoles',
      'Eldorado',
      'Óberá',
    ])
  })

  it('no muta la entrada', () => {
    const entrada = [
      { nombre: 'B', descargas: 1 },
      { nombre: 'A', descargas: 2 },
    ]
    ordenarLocalidades(entrada)
    expect(entrada[0].nombre).toBe('B')
  })
})

describe('ordenarNormativas', () => {
  it('ordena por descargas desc y desempata por id asc', () => {
    const entrada = [
      { id: 5, descargas: 0 },
      { id: 2, descargas: 7 },
      { id: 1, descargas: 0 },
    ]
    expect(ordenarNormativas(entrada).map((n) => n.id)).toEqual([2, 1, 5])
  })
})
