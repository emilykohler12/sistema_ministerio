import { describe, expect, it } from 'vitest'
import { normalizar } from './texto'

describe('normalizar', () => {
  it('pasa a minúsculas y quita tildes y diacríticos', () => {
    expect(normalizar('Cuidádos EN Línea Ñandú')).toBe('cuidados en linea nandu')
  })

  it('deja igual un texto ya normalizado', () => {
    expect(normalizar('huerta')).toBe('huerta')
  })
})
