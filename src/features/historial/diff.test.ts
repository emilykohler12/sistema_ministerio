import { describe, expect, it } from 'vitest'
import { cambios } from './diff'
import type { Operacion } from './types'

/*
 * Contrato (spec criterio 2; crítica 1):
 *   cambios(op: Operacion): { campo: string; antes: Json | null; despues: Json | null }[]
 *   - UPDATE: solo los campos cuyo valor cambió (comparación profunda), sin `updated_at`; antes/despues de cada lado.
 *   - INSERT: todos los campos de datos_nuevos con antes = null.
 *   - DELETE: todos los campos de datos_anteriores con despues = null.
 *   - Una modificación que solo cambió `updated_at` devuelve [] (la UI muestra "Sin cambios en los campos del registro").
 *   - Mantiene el orden de las claves del jsonb.
 */
function op(p: Partial<Operacion>): Operacion {
  return {
    id: 1,
    usuario_id: null,
    operacion: 'UPDATE',
    tabla: 'taller',
    registro_id: '7',
    datos_anteriores: null,
    datos_nuevos: null,
    fecha_hora: '2026-10-16T12:00:00Z',
    ...p,
  }
}

describe('cambios: modificación', () => {
  it('devuelve solo los campos que cambiaron, con antes y después', () => {
    const r = cambios(
      op({
        datos_anteriores: { id: 7, nombre: 'A', estado: 'BORRADOR', descripcion: 'x' },
        datos_nuevos: { id: 7, nombre: 'B', estado: 'PUBLICADO', descripcion: 'x' },
      }),
    )
    expect(r).toEqual([
      { campo: 'nombre', antes: 'A', despues: 'B' },
      { campo: 'estado', antes: 'BORRADOR', despues: 'PUBLICADO' },
    ])
  })

  it('excluye updated_at aunque cambie', () => {
    const r = cambios(
      op({
        datos_anteriores: { nombre: 'A', updated_at: '2026-10-01T00:00:00Z' },
        datos_nuevos: { nombre: 'B', updated_at: '2026-10-02T00:00:00Z' },
      }),
    )
    expect(r.map((c) => c.campo)).toEqual(['nombre'])
  })

  it('si solo cambió updated_at devuelve una lista vacía', () => {
    const r = cambios(
      op({
        datos_anteriores: { nombre: 'A', updated_at: '2026-10-01T00:00:00Z' },
        datos_nuevos: { nombre: 'A', updated_at: '2026-10-02T00:00:00Z' },
      }),
    )
    expect(r).toEqual([])
  })

  it('un campo que pasa de valor a null y de null a valor cuenta como cambio', () => {
    const r = cambios(op({ datos_anteriores: { a: 'x', b: null }, datos_nuevos: { a: null, b: 'y' } }))
    expect(r).toEqual([
      { campo: 'a', antes: 'x', despues: null },
      { campo: 'b', antes: null, despues: 'y' },
    ])
  })

  it('compara en profundidad los valores anidados (arrays y objetos iguales no cambian)', () => {
    const r = cambios(
      op({
        datos_anteriores: { tags: [1, 2], meta: { a: 1 }, otro: [1] },
        datos_nuevos: { tags: [1, 2], meta: { a: 1 }, otro: [1, 2] },
      }),
    )
    expect(r).toEqual([{ campo: 'otro', antes: [1], despues: [1, 2] }])
  })

  it('un número y su texto no son lo mismo', () => {
    expect(cambios(op({ datos_anteriores: { n: 1 }, datos_nuevos: { n: '1' } }))).toHaveLength(1)
  })
})

describe('cambios: alta y baja', () => {
  it('en un alta devuelve todos los campos con antes = null', () => {
    const r = cambios(op({ operacion: 'INSERT', datos_nuevos: { id: 7, nombre: 'A', estado: 'BORRADOR' } }))
    expect(r).toEqual([
      { campo: 'id', antes: null, despues: 7 },
      { campo: 'nombre', antes: null, despues: 'A' },
      { campo: 'estado', antes: null, despues: 'BORRADOR' },
    ])
  })

  it('en una baja devuelve todos los campos con despues = null', () => {
    const r = cambios(op({ operacion: 'DELETE', datos_anteriores: { id: 7, nombre: 'A' } }))
    expect(r).toEqual([
      { campo: 'id', antes: 7, despues: null },
      { campo: 'nombre', antes: 'A', despues: null },
    ])
  })

  it('sin jsonb (fila vacía) devuelve una lista vacía y no lanza', () => {
    expect(cambios(op({ operacion: 'INSERT', datos_nuevos: null }))).toEqual([])
    expect(cambios(op({ operacion: 'DELETE', datos_anteriores: null }))).toEqual([])
    expect(cambios(op({ operacion: 'UPDATE' }))).toEqual([])
  })
})
