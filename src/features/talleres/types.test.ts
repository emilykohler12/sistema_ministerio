import { describe, expect, it } from 'vitest'
import { destinatarioLabel, NIVELES_FILTRO, nivelLabel } from './types'

describe('nivelLabel', () => {
  it('devuelve la etiqueta legible de un nivel', () => {
    expect(nivelLabel('formacion-profesional')).toBe('Formación profesional')
  })
})

describe('destinatarioLabel', () => {
  it('devuelve la etiqueta legible de un destinatario', () => {
    expect(destinatarioLabel('comunidad')).toBe('Comunidad educativa')
  })
})

describe('NIVELES_FILTRO', () => {
  it('no incluye la opción "todos"', () => {
    expect(NIVELES_FILTRO.some((n) => n.value === 'todos')).toBe(false)
  })
})
