import { describe, expect, it } from 'vitest'
import * as tipos from './types'
import { destinatarioLabel, idDeRuta, NIVELES, nombreNivel } from './types'

describe('NIVELES', () => {
  it('tiene los 5 niveles de la base con ids 1-5, nombre y orden', () => {
    expect(NIVELES.map((n) => [n.id, n.nombre, n.orden])).toEqual([
      [1, 'Inicial', 1],
      [2, 'Primario', 2],
      [3, 'Secundario', 3],
      [4, 'Terciario', 4],
      [5, 'Formación profesional', 5],
    ])
  })

  it('no incluye la opción "todos"', () => {
    expect(JSON.stringify(NIVELES).toLowerCase()).not.toContain('todos')
  })
})

describe('nombreNivel', () => {
  it('devuelve el nombre legible de un nivel por id', () => {
    expect(nombreNivel(5)).toBe('Formación profesional')
    expect(nombreNivel(1)).toBe('Inicial')
  })
})

describe('idDeRuta', () => {
  it('devuelve el entero positivo que representa el parámetro', () => {
    expect(idDeRuta('3')).toBe(3)
    expect(idDeRuta('120')).toBe(120)
  })

  it('devuelve null si no hay parámetro o no es un entero positivo', () => {
    for (const invalido of [undefined, '', 'abc', '0', '-1', '1.5', '1e3', ' 3', '3 ', '03', '9'.repeat(30)]) {
      expect(idDeRuta(invalido)).toBeNull()
    }
  })
})

describe('exports retirados', () => {
  it('ya no existen NIVELES_FILTRO, NIVEL_VALUES ni nivelLabel', () => {
    expect(tipos).not.toHaveProperty('NIVELES_FILTRO')
    expect(tipos).not.toHaveProperty('NIVEL_VALUES')
    expect(tipos).not.toHaveProperty('nivelLabel')
  })
})

describe('destinatarioLabel', () => {
  it('devuelve la etiqueta legible de un destinatario', () => {
    expect(destinatarioLabel('comunidad')).toBe('Comunidad educativa')
  })
})
