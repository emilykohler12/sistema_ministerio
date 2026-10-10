import { describe, expect, it } from 'vitest'
import { filtrarNormativas, ordenarNormativas } from './filtrar'
import type { Normativa } from './types'

/*
 * Contrato de src/features/normativas/filtrar.ts (puro, sin imports de supabase; criterio 5). Usa `normalizar` de
 * @/features/talleres/filtrar (minúsculas y sin tildes).
 *   filtrarNormativas(normativas: Normativa[], busqueda?: string): Normativa[]
 *     busca (contiene) en título, número, descripción y nombres de etiquetas; sin distinguir mayúsculas ni tildes.
 *     Búsqueda vacía, de espacios o undefined no filtra. Conserva el orden recibido y no modifica el arreglo.
 *   ordenarNormativas(normativas: Normativa[]): Normativa[]
 *     copia ordenada por año descendente y, a igual año, por id descendente.
 */

function normativa(id: number, p: Partial<Normativa> = {}): Normativa {
  return {
    id,
    titulo: `Normativa ${id}`,
    descripcion: null,
    numero: `${id}/24`,
    anio: 2024,
    ruta_archivo: `00000000-0000-0000-0000-00000000000${id}.pdf`,
    descargas: 0,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    etiqueta: [],
    url: `https://ejemplo.test/normativas/${id}.pdf`,
    ...p,
  }
}

const evaluacion = normativa(1, {
  titulo: 'Régimen de evaluación',
  numero: 'Res. 1234/24',
  descripcion: 'Criterios de acreditación',
  etiqueta: [{ id: 1, nombre: 'Evaluación' }],
})
const asistencia = normativa(2, {
  titulo: 'Asistencia',
  numero: 'Disp. 55/23',
  anio: 2023,
  descripcion: null,
  etiqueta: [{ id: 2, nombre: 'Ñandú' }],
})
const todas = [evaluacion, asistencia]

describe('filtrarNormativas', () => {
  it('sin búsqueda, vacía o de espacios devuelve todas', () => {
    expect(filtrarNormativas(todas)).toEqual(todas)
    expect(filtrarNormativas(todas, '')).toEqual(todas)
    expect(filtrarNormativas(todas, '   ')).toEqual(todas)
  })

  it('busca en el título sin distinguir mayúsculas ni tildes', () => {
    expect(filtrarNormativas(todas, 'REGIMEN')).toEqual([evaluacion])
    expect(filtrarNormativas(todas, 'asistência')).toEqual([asistencia])
  })

  it('busca en el número', () => {
    expect(filtrarNormativas(todas, '1234/24')).toEqual([evaluacion])
    expect(filtrarNormativas(todas, 'DISP.')).toEqual([asistencia])
  })

  it('busca en la descripción (y tolera descripción nula)', () => {
    expect(filtrarNormativas(todas, 'acreditacion')).toEqual([evaluacion])
  })

  it('busca en las etiquetas', () => {
    expect(filtrarNormativas(todas, 'nandu')).toEqual([asistencia])
  })

  it('devuelve vacío si nada coincide', () => {
    expect(filtrarNormativas(todas, 'astronomía')).toEqual([])
  })

  it('conserva el orden recibido y no modifica el arreglo', () => {
    const copia = [...todas]
    expect(filtrarNormativas(todas, '2')).toEqual(todas)
    expect(todas).toEqual(copia)
  })
})

describe('ordenarNormativas', () => {
  it('ordena por año descendente y, a igual año, por id descendente', () => {
    const n1 = normativa(1, { anio: 2023 })
    const n2 = normativa(2, { anio: 2024 })
    const n3 = normativa(3, { anio: 2024 })
    const n4 = normativa(4, { anio: 2022 })
    expect(ordenarNormativas([n1, n4, n2, n3]).map((n) => n.id)).toEqual([3, 2, 1, 4])
  })

  it('no modifica el arreglo recibido', () => {
    const entrada = [normativa(1, { anio: 2020 }), normativa(2, { anio: 2025 })]
    const copia = [...entrada]
    ordenarNormativas(entrada)
    expect(entrada).toEqual(copia)
  })
})
