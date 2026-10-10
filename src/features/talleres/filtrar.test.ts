import { describe, expect, it } from 'vitest'
import { filtrarTalleres } from './filtrar'
import type { Taller } from './types'

function taller(id: number, p: Partial<Taller> & { nivel_id?: number } = {}): Taller {
  const { nivel_id = 3, ...resto } = p
  return {
    id,
    categoria_id: 7,
    nombre: `Taller ${id}`,
    descripcion: '',
    estado: 'PUBLICADO',
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    categoria: { nivel_id },
    destinatario: [],
    etiqueta: [],
    recurso: [],
    ...resto,
  }
}

const directivos = { id: 1, nombre: 'Directivos' }
const docentes = { id: 4, nombre: 'Docentes' }

describe('filtrarTalleres', () => {
  const huerta = taller(1, { nombre: 'Huerta escolar', descripcion: 'Cultivo en el patio', nivel_id: 2, destinatario: [docentes] })
  const redes = taller(2, {
    nombre: 'Cuidados en redes',
    descripcion: 'Convivencia digital',
    nivel_id: 3,
    destinatario: [directivos, docentes],
    etiqueta: [{ id: 1, nombre: 'Ciberseguridad' }],
  })
  const todos = [huerta, redes]

  it('sin filtros devuelve todos los talleres', () => {
    expect(filtrarTalleres(todos, {})).toEqual(todos)
  })

  it('con una búsqueda vacía o de espacios no filtra', () => {
    expect(filtrarTalleres(todos, { busqueda: '' })).toEqual(todos)
    expect(filtrarTalleres(todos, { busqueda: '   ' })).toEqual(todos)
  })

  it('busca en el nombre sin distinguir mayúsculas ni tildes', () => {
    expect(filtrarTalleres(todos, { busqueda: 'CUIDÁDOS' })).toEqual([redes])
  })

  it('busca en la descripción', () => {
    expect(filtrarTalleres(todos, { busqueda: 'patio' })).toEqual([huerta])
    expect(filtrarTalleres(todos, { busqueda: 'convivéncia' })).toEqual([redes])
  })

  it('busca en las etiquetas', () => {
    expect(filtrarTalleres(todos, { busqueda: 'ciberseguridad' })).toEqual([redes])
  })

  it('devuelve vacío si nada coincide', () => {
    expect(filtrarTalleres(todos, { busqueda: 'astronomía' })).toEqual([])
  })

  it('filtra por nivel a través de la categoría del taller', () => {
    expect(filtrarTalleres(todos, { nivelId: 2 })).toEqual([huerta])
    expect(filtrarTalleres(todos, { nivelId: 3 })).toEqual([redes])
    expect(filtrarTalleres(todos, { nivelId: 5 })).toEqual([])
  })

  it('filtra por destinatario', () => {
    expect(filtrarTalleres(todos, { destinatarioId: 1 })).toEqual([redes])
    expect(filtrarTalleres(todos, { destinatarioId: 4 })).toEqual(todos)
  })

  it('combina nivel, destinatario y búsqueda (todos deben cumplirse)', () => {
    expect(filtrarTalleres(todos, { nivelId: 3, destinatarioId: 4, busqueda: 'redes' })).toEqual([redes])
    expect(filtrarTalleres(todos, { nivelId: 2, destinatarioId: 4, busqueda: 'redes' })).toEqual([])
    expect(filtrarTalleres(todos, { nivelId: 3, destinatarioId: 3 })).toEqual([])
  })

  it('no modifica el arreglo recibido', () => {
    const copia = [...todos]
    filtrarTalleres(todos, { nivelId: 2 })
    expect(todos).toEqual(copia)
  })
})
