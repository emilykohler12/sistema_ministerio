// @vitest-environment node
// Spec: docs/specs/padron/fase-b.md (diseño: csv.ts). Imports relativos con .ts: Node 24 los ejecuta sin compilar.
import { describe, expect, it } from 'vitest'
import { decodificarCsv, leerFilas, parsearCsv } from './csv.ts'

describe('parsearCsv', () => {
  it('devuelve todos los registros, encabezado incluido, como arreglos de celdas', () => {
    expect(parsearCsv('cue,nombre,localidad\n1,Escuela 1,Posadas\n')).toEqual([
      ['cue', 'nombre', 'localidad'],
      ['1', 'Escuela 1', 'Posadas'],
    ])
  })

  it('acepta CRLF y un último registro sin salto de línea', () => {
    expect(parsearCsv('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('ignora el BOM inicial', () => {
    expect(parsearCsv('﻿cue,nombre\n1,X')[0]).toEqual(['cue', 'nombre'])
  })

  it('detecta el separador ; en el encabezado', () => {
    expect(parsearCsv('cue;nombre;localidad\n1;Escuela 1;Posadas')).toEqual([
      ['cue', 'nombre', 'localidad'],
      ['1', 'Escuela 1', 'Posadas'],
    ])
  })

  it('respeta comillas: separador y salto de línea dentro de una celda', () => {
    expect(parsearCsv('a,b\n"x, y","línea 1\nlínea 2"')[1]).toEqual(['x, y', 'línea 1\nlínea 2'])
  })

  it('interpreta las comillas dobles escapadas como una comilla', () => {
    expect(parsearCsv('a,b\n"Escuela ""Los Pinos""",2')[1]).toEqual(['Escuela "Los Pinos"', '2'])
  })

  it('con ; como separador, una coma dentro de la celda no separa', () => {
    expect(parsearCsv('a;b\nx, y;z')[1]).toEqual(['x, y', 'z'])
  })

  it('conserva las celdas vacías', () => {
    expect(parsearCsv('a,b,c\n,x,')[1]).toEqual(['', 'x', ''])
  })
})

describe('leerFilas', () => {
  it('mapea cue, nombre y localidad, con el número de fila del archivo (el encabezado es la 1)', () => {
    const filas = leerFilas('cue,nombre,localidad\n100,Escuela 1,Posadas\n200,Escuela 2,Oberá\n')
    expect(filas).toEqual([
      { fila: 2, cue: '100', nombre: 'Escuela 1', localidad: 'Posadas' },
      { fila: 3, cue: '200', nombre: 'Escuela 2', localidad: 'Oberá' },
    ])
  })

  it('no distingue mayúsculas en el encabezado ni el orden de las columnas', () => {
    expect(leerFilas('Localidad;NOMBRE;Cue\nPosadas;Escuela 1;100')).toEqual([
      { fila: 2, cue: '100', nombre: 'Escuela 1', localidad: 'Posadas' },
    ])
  })

  it('funciona con BOM y CRLF juntos', () => {
    expect(leerFilas('﻿cue,nombre,localidad\r\n100,Escuela 1,Posadas\r\n')).toEqual([
      { fila: 2, cue: '100', nombre: 'Escuela 1', localidad: 'Posadas' },
    ])
  })

  it('ignora las columnas que no usa', () => {
    expect(leerFilas('cue,nombre,nivel,localidad\n100,Escuela 1,Primario,Posadas')).toEqual([
      { fila: 2, cue: '100', nombre: 'Escuela 1', localidad: 'Posadas' },
    ])
  })

  it('una celda ausente al final de la fila queda como cadena vacía', () => {
    expect(leerFilas('cue,nombre,localidad\n100,Escuela 1')[0]).toMatchObject({ cue: '100', localidad: '' })
  })

  it.each(['cue', 'nombre', 'localidad'])('lanza un error claro si falta la columna %s', (columna) => {
    const columnas = ['cue', 'nombre', 'localidad'].filter((c) => c !== columna).join(',')
    expect(() => leerFilas(`${columnas}\n1,2`)).toThrow(new RegExp(`falta la columna.*${columna}`, 'i'))
  })

  it('un archivo con solo encabezado devuelve cero filas', () => {
    expect(leerFilas('cue,nombre,localidad\n')).toEqual([])
  })
})

describe('parsearCsv: comillas', () => {
  it('una comilla sin cerrar al final del archivo lanza un error con el registro donde se abrió', () => {
    const texto = 'cue,nombre,localidad\n1,"Escuela sin cerrar,Posadas\n2,Escuela 2,Posadas\n'
    expect(() => parsearCsv(texto)).toThrow(/comilla sin cerrar.*registro 2/i)
  })

  it('el registro del error cuenta los registros anteriores', () => {
    expect(() => parsearCsv('a,b\n1,2\n3,"4\n5,6')).toThrow(/registro 3/)
  })

  it('una comilla en medio de una celda sin comillas es literal', () => {
    expect(parsearCsv('a,b\n1,Escuela "Gral San Martin,Posadas')[1]).toEqual(['1', 'Escuela "Gral San Martin', 'Posadas'])
  })

  it('una comilla al final de una celda sin comillas es literal', () => {
    expect(parsearCsv('a,b\n1,pulgadas 5",x')[1]).toEqual(['1', 'pulgadas 5"', 'x'])
  })
})

describe('decodificarCsv', () => {
  it('decodifica UTF-8 y quita el BOM', () => {
    const bytes = new TextEncoder().encode('﻿cue,nombre\n1,Oberá N° 1')
    expect(decodificarCsv(bytes)).toBe('cue,nombre\n1,Oberá N° 1')
  })

  it('un archivo en cp1252 (Oberá = 4f 62 65 72 e1) falla con un mensaje sobre UTF-8 y Excel', () => {
    const cp1252 = Uint8Array.from([0x4f, 0x62, 0x65, 0x72, 0xe1, 0x2c, 0x4e, 0xb0])
    expect(() => decodificarCsv(cp1252)).toThrow(/UTF-8/)
    expect(() => decodificarCsv(cp1252)).toThrow(/CSV UTF-8/)
  })
})
