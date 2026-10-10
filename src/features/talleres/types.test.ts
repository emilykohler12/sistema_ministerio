import { describe, expect, it } from 'vitest'
import * as tipos from './types'
import { DESTINATARIOS, NIVELES, nombreNivel } from './types'

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

describe('exports retirados', () => {
  it('ya no existen NIVELES_FILTRO, NIVEL_VALUES ni nivelLabel', () => {
    expect(tipos).not.toHaveProperty('NIVELES_FILTRO')
    expect(tipos).not.toHaveProperty('NIVEL_VALUES')
    expect(tipos).not.toHaveProperty('nivelLabel')
  })
})

describe('DESTINATARIOS', () => {
  it('tiene los 5 destinatarios de la base con ids 1-5 y su nombre', () => {
    expect(DESTINATARIOS.map((d) => [d.id, d.nombre])).toEqual([
      [1, 'Directivos'],
      [2, 'Familias'],
      [3, 'Estudiantes'],
      [4, 'Docentes'],
      [5, 'Comunidad educativa'],
    ])
  })
})

describe('exports retirados del dominio talleres', () => {
  it('ya no existen destinatarioLabel', () => {
    expect(tipos).not.toHaveProperty('destinatarioLabel')
  })
})
