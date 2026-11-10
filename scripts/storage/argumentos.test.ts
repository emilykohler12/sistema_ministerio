// @vitest-environment node
// leerArgumentos es puro: recibe los argumentos de la línea de comandos y devuelve { aplicar, edadMinima } o lanza.
import { describe, expect, it } from 'vitest'
import { leerArgumentos } from './argumentos.ts'

describe('leerArgumentos', () => {
  it('sin argumentos simula con la edad mínima por defecto de 60 minutos', () => {
    expect(leerArgumentos([])).toEqual({ aplicar: false, edadMinima: 60 })
  })

  it('--aplicar activa el borrado', () => {
    expect(leerArgumentos(['--aplicar'])).toEqual({ aplicar: true, edadMinima: 60 })
  })

  it.each([
    ['0', 0],
    ['60', 60],
    ['1440', 1440],
  ])('--edad-minima=%s es válida', (valor, esperado) => {
    expect(leerArgumentos([`--edad-minima=${valor}`]).edadMinima).toBe(esperado)
  })

  it.each(['x', '-1', '1.5', '', '1e3', ' 5'])('--edad-minima=%j aborta', (valor) => {
    expect(() => leerArgumentos([`--edad-minima=${valor}`])).toThrow(/edad-minima/)
  })

  it('--edad-minima sin "=" aborta', () => {
    expect(() => leerArgumentos(['--edad-minima'])).toThrow(/Opción desconocida|edad-minima/)
    expect(() => leerArgumentos(['--edad-minima', '5'])).toThrow()
  })

  it('una opción desconocida aborta', () => {
    expect(() => leerArgumentos(['--borrar-todo'])).toThrow(/Opción desconocida: --borrar-todo/)
  })

  it('un argumento suelto aborta', () => {
    expect(() => leerArgumentos(['sobra'])).toThrow(/Sobra un argumento: sobra/)
  })

  it('acepta --confirmar y --confirmar=host: los resuelve resolverDestino', () => {
    expect(leerArgumentos(['--confirmar'])).toEqual({ aplicar: false, edadMinima: 60 })
    expect(leerArgumentos(['--aplicar', '--confirmar=abc.supabase.co', '--edad-minima=5'])).toEqual({
      aplicar: true,
      edadMinima: 5,
    })
  })
})
