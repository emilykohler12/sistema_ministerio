import { describe, expect, it } from 'vitest'
import { filtrarEstablecimientos } from './filtrar'
import type { Establecimiento } from './types'

/*
 * Contrato de src/features/establecimientos/filtrar.ts (puro, sin imports de supabase; criterio 7).
 *   filtrarEstablecimientos(establecimientos: Establecimiento[], busqueda?: string): Establecimiento[]
 *     busca (contiene) en nombre o CUE, sin distinguir mayúsculas ni tildes. Búsqueda vacía, de espacios o
 *     undefined no filtra. Conserva el orden recibido, no modifica el arreglo y no descarta inactivos.
 *     Un establecimiento sin CUE (null) no rompe la búsqueda.
 */
function establecimiento(id: number, p: Partial<Establecimiento> = {}): Establecimiento {
  return {
    id,
    cue: null,
    nombre: `Escuela ${id}`,
    localidad_id: 1,
    activo: true,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}

const normal = establecimiento(1, { nombre: 'Escuela Normal Superior', cue: '5400123' })
const jardin = establecimiento(2, { nombre: 'Jardín de Infantes Nº 7', cue: '5400456' })
const inactiva = establecimiento(3, { nombre: 'Instituto Ñandú', cue: null, activo: false })
const todos = [normal, jardin, inactiva]

describe('filtrarEstablecimientos', () => {
  it('sin búsqueda, vacía, de espacios o undefined devuelve todos', () => {
    expect(filtrarEstablecimientos(todos)).toEqual(todos)
    expect(filtrarEstablecimientos(todos, '')).toEqual(todos)
    expect(filtrarEstablecimientos(todos, '   ')).toEqual(todos)
    expect(filtrarEstablecimientos(todos, undefined)).toEqual(todos)
  })

  it('busca por nombre sin distinguir mayúsculas ni tildes', () => {
    expect(filtrarEstablecimientos(todos, 'JARDIN')).toEqual([jardin])
    expect(filtrarEstablecimientos(todos, 'normal sup')).toEqual([normal])
    expect(filtrarEstablecimientos(todos, 'nandu')).toEqual([inactiva])
  })

  it('busca por CUE (coincidencia parcial)', () => {
    expect(filtrarEstablecimientos(todos, '5400456')).toEqual([jardin])
    expect(filtrarEstablecimientos(todos, '5400')).toEqual([normal, jardin])
  })

  it('un establecimiento sin CUE se encuentra por nombre y no rompe la búsqueda por CUE', () => {
    expect(filtrarEstablecimientos(todos, 'instituto')).toEqual([inactiva])
    expect(filtrarEstablecimientos(todos, '999')).toEqual([])
  })

  it('conserva el orden recibido, incluye inactivos y no modifica el arreglo original', () => {
    const copia = [...todos]
    expect(filtrarEstablecimientos([inactiva, normal], 'i').map((e) => e.id)).toEqual([3, 1])
    expect(filtrarEstablecimientos(todos, 'a')).toContain(inactiva)
    expect(todos).toEqual(copia)
  })
})
