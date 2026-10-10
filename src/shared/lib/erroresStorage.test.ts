import { describe, expect, it } from 'vitest'
import { codigosDeError } from './erroresStorage'

describe('codigosDeError', () => {
  it('junta status y statusCode, número o texto, como texto', () => {
    expect(codigosDeError({ status: 400, statusCode: '413' })).toEqual(['400', '413'])
    expect(codigosDeError({ statusCode: 415 })).toEqual(['415'])
  })

  it('ignora lo que no es número ni texto y los valores que no son objetos', () => {
    expect(codigosDeError({ status: null, statusCode: undefined })).toEqual([])
    for (const v of [null, undefined, 'texto', 42]) expect(codigosDeError(v)).toEqual([])
  })
})
