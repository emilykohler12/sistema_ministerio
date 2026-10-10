// @vitest-environment node
// Spec: docs/specs/padron/fase-b.md, criterios 2, 3, 4 y 6. planificar es puro: no toca la base.
//
// Firmas asumidas:
//   FilaCsv      = { fila: number; cue: string; nombre: string; localidad: string }
//   Existente    = { id: number; cue: string | null; nombre: string; localidad_id: number; activo: boolean }
//   Localidad    = { id: number; nombre: string }
//   Equivalencias = Record<string, string>   clave: localidad del CSV normalizada; valor: nombre de una localidad de la base
//   Plan         = { altas: Alta[]; cambios: Cambio[]; rechazos: Rechazo[] }
//   Alta         = { fila; cue; nombre (limpio); localidad_id }
//   Cambio       = { fila; id; cue; nombre (limpio); localidad_id }   (valores nuevos; sin `activo`)
//   Rechazo      = { fila; motivo: string }
import { describe, expect, it } from 'vitest'
import { planificar } from './planificar.ts'
import type { Existente, FilaCsv, Plan } from './planificar.ts'

const LOCALIDADES = [
  { id: 1, nombre: 'Apóstoles' },
  { id: 2, nombre: 'Oberá' },
  { id: 3, nombre: 'Posadas' },
  { id: 4, nombre: 'Puerto Iguazú' },
]

const fila = (n: number, cue: string, nombre: string, localidad = 'Posadas'): FilaCsv => ({
  fila: n,
  cue,
  nombre,
  localidad,
})

const existente = (id: number, cue: string | null, nombre: string, localidad_id = 3, activo = true): Existente => ({
  id,
  cue,
  nombre,
  localidad_id,
  activo,
})

const plan = (filas: FilaCsv[], existentes: Existente[] = [], equivalencias: Record<string, string> = {}): Plan =>
  planificar(filas, existentes, LOCALIDADES, equivalencias)

// Simula la escritura del plan para probar la idempotencia sin base.
function aplicar(existentes: Existente[], p: Plan): Existente[] {
  const resultado = existentes.map((e) => ({ ...e }))
  for (const c of p.cambios) {
    const e = resultado.find((x) => x.id === c.id)
    if (e) Object.assign(e, { nombre: c.nombre, localidad_id: c.localidad_id })
  }
  let siguiente = Math.max(0, ...existentes.map((e) => e.id)) + 1
  for (const a of p.altas) {
    resultado.push({ id: siguiente++, cue: a.cue, nombre: a.nombre, localidad_id: a.localidad_id, activo: true })
  }
  return resultado
}

describe('planificar: altas', () => {
  it('un CUE que no está en la base es un alta con la localidad resuelta', () => {
    const p = plan([fila(2, '100', 'Escuela 1', 'Oberá')])
    expect(p.altas).toEqual([{ fila: 2, cue: '100', nombre: 'Escuela 1', localidad_id: 2 }])
    expect(p.cambios).toEqual([])
    expect(p.rechazos).toEqual([])
  })

  it('un alta no lleva `activo` (lo decide el default de la base)', () => {
    expect(plan([fila(2, '100', 'Escuela 1')]).altas[0]).not.toHaveProperty('activo')
  })
})

describe('planificar: cambios (criterio 3)', () => {
  it('un CUE existente con otro nombre actualiza el nombre', () => {
    const p = plan([fila(2, '100', 'Escuela 1 Nueva')], [existente(7, '100', 'Escuela 1')])
    expect(p.cambios).toEqual([{ fila: 2, id: 7, cue: '100', nombre: 'Escuela 1 Nueva', localidad_id: 3 }])
    expect(p.altas).toEqual([])
  })

  it('un CUE existente en otra localidad actualiza la localidad', () => {
    const p = plan([fila(2, '100', 'Escuela 1', 'Oberá')], [existente(7, '100', 'Escuela 1', 3)])
    expect(p.cambios).toEqual([{ fila: 2, id: 7, cue: '100', nombre: 'Escuela 1', localidad_id: 2 }])
  })

  it('si nombre y localidad ya coinciden no hay cambio', () => {
    const p = plan([fila(2, '100', 'Escuela 1')], [existente(7, '100', 'Escuela 1')])
    expect(p).toEqual({ altas: [], cambios: [], rechazos: [] })
  })

  it('nunca toca `activo`: un establecimiento inactivo se actualiza sin reactivarlo', () => {
    const p = plan([fila(2, '100', 'Escuela 1 Nueva')], [existente(7, '100', 'Escuela 1', 3, false)])
    expect(p.cambios).toHaveLength(1)
    expect(p.cambios[0]).not.toHaveProperty('activo')
  })

  it('los establecimientos ausentes del CSV no aparecen en el plan', () => {
    const p = plan([fila(2, '100', 'Escuela 1')], [existente(7, '100', 'Escuela 1'), existente(8, '200', 'Escuela 2')])
    expect(p).toEqual({ altas: [], cambios: [], rechazos: [] })
  })

  it('los establecimientos sin CUE no se tocan ni se emparejan por nombre', () => {
    const p = plan([fila(2, '300', 'Escuela 3')], [existente(9, null, 'Escuela 9')])
    expect(p.altas).toHaveLength(1)
    expect(p.cambios).toEqual([])
  })
})

describe('planificar: rechazos de validación (criterio 4)', () => {
  it('rechaza una fila sin CUE', () => {
    expect(plan([fila(5, '', 'Escuela 1')]).rechazos).toEqual([{ fila: 5, motivo: expect.stringMatching(/sin CUE/i) }])
  })

  it('un CUE de solo espacios cuenta como sin CUE', () => {
    expect(plan([fila(5, '  ', 'Escuela 1')]).rechazos[0].motivo).toMatch(/sin CUE/i)
  })

  it.each(['12a', 'A100', '1 2', '-5', `${'1'.repeat(21)}`])('rechaza el CUE inválido %s', (cue) => {
    const p = plan([fila(4, cue, 'Escuela 1')])
    expect(p.rechazos).toEqual([{ fila: 4, motivo: expect.stringMatching(/CUE inválido/i) }])
    expect(p.altas).toEqual([])
  })

  it('acepta un CUE de 20 dígitos', () => {
    expect(plan([fila(2, '1'.repeat(20), 'Escuela 1')]).altas).toHaveLength(1)
  })

  it('rechaza el nombre vacío o de solo espacios (incluido U+00A0)', () => {
    const p = plan([fila(2, '1', ''), fila(3, '2', '   '), fila(4, '3', '  ')])
    expect(p.rechazos.map((r) => r.fila)).toEqual([2, 3, 4])
    for (const r of p.rechazos) expect(r.motivo).toMatch(/nombre vacío/i)
  })

  it('rechaza el nombre de más de 200 caracteres y acepta uno de exactamente 200', () => {
    const p = plan([fila(2, '1', 'a'.repeat(201)), fila(3, '2', 'b'.repeat(200))])
    expect(p.rechazos).toEqual([{ fila: 2, motivo: expect.stringMatching(/200/) }])
    expect(p.altas.map((a) => a.fila)).toEqual([3])
  })

  it('rechaza una localidad desconocida', () => {
    const p = plan([fila(2, '1', 'Escuela 1', 'Narnia')])
    expect(p.rechazos).toEqual([{ fila: 2, motivo: expect.stringMatching(/localidad desconocida/i) }])
  })

  it('rechaza una fila sin localidad', () => {
    expect(plan([fila(2, '1', 'Escuela 1', '')]).rechazos[0].motivo).toMatch(/localidad desconocida/i)
  })

  it('una fila rechazada no frena a las válidas', () => {
    const p = plan([fila(2, '', 'Mala'), fila(3, '2', 'Buena')])
    expect(p.altas.map((a) => a.fila)).toEqual([3])
    expect(p.rechazos.map((r) => r.fila)).toEqual([2])
  })
})

describe('planificar: limpieza y localidades (criterio 6)', () => {
  it('limpia el nombre: extremos con U+00A0 e internos repetidos quedan en un espacio', () => {
    const p = plan([fila(2, '1', '  Escuela  N° 2   Norte  ')])
    expect(p.altas[0].nombre).toBe('Escuela N° 2 Norte')
  })

  it('compara con el nombre limpio: el espacio duro no genera un cambio falso', () => {
    const p = plan([fila(2, '100', 'Escuela 1 ')], [existente(7, '100', 'Escuela 1')])
    expect(p).toEqual({ altas: [], cambios: [], rechazos: [] })
  })

  it('la localidad se busca sin mayúsculas, tildes ni espacios de más', () => {
    const p = plan([
      fila(2, '1', 'A', 'OBERA'),
      fila(3, '2', 'B', '  apostoles '),
      fila(4, '3', 'C', 'puerto  iguazu'),
      fila(5, '4', 'D', ' Posadas '),
    ])
    expect(p.altas.map((a) => a.localidad_id)).toEqual([2, 1, 4, 3])
    expect(p.rechazos).toEqual([])
  })

  it('si la localidad no aparece, se busca en equivalencias (clave normalizada)', () => {
    const p = plan([fila(2, '1', 'Escuela 1', 'Pto. Iguazú')], [], { 'pto. iguazu': 'Puerto Iguazú' })
    expect(p.altas).toEqual([{ fila: 2, cue: '1', nombre: 'Escuela 1', localidad_id: 4 }])
  })

  it('una equivalencia que apunta a una localidad inexistente deja la fila como desconocida', () => {
    const p = plan([fila(2, '1', 'Escuela 1', 'Pto')], [], { pto: 'Narnia' })
    expect(p.rechazos[0].motivo).toMatch(/localidad desconocida/i)
  })

  it('el nombre del establecimiento mantiene mayúsculas y tildes al guardarse', () => {
    expect(plan([fila(2, '1', 'ESCUELA Nº 5 "Cuidádos"')]).altas[0].nombre).toBe('ESCUELA Nº 5 "Cuidádos"')
  })
})

describe('planificar: choques dentro del CSV (criterio 4)', () => {
  it('rechaza la segunda aparición de un CUE y conserva la primera', () => {
    const p = plan([fila(2, '100', 'Escuela 1'), fila(3, '100', 'Escuela 2')])
    expect(p.altas.map((a) => a.fila)).toEqual([2])
    expect(p.rechazos).toEqual([{ fila: 3, motivo: expect.stringMatching(/CUE repetido/i) }])
  })

  it('rechaza (localidad, nombre) repetido con distinto CUE, sin distinguir mayúsculas, tildes ni U+00A0', () => {
    const p = plan([fila(2, '1', 'Escuela Oberá'), fila(3, '2', ' ESCUELA  obera')])
    expect(p.altas.map((a) => a.fila)).toEqual([2])
    expect(p.rechazos).toEqual([{ fila: 3, motivo: expect.stringMatching(/repetid/i) }])
  })

  it('el mismo nombre en otra localidad no choca', () => {
    const p = plan([fila(2, '1', 'Escuela 1', 'Posadas'), fila(3, '2', 'Escuela 1', 'Oberá')])
    expect(p.altas).toHaveLength(2)
    expect(p.rechazos).toEqual([])
  })
})

describe('planificar: choques contra la base (criterio 4)', () => {
  it('rechaza un CUE nuevo cuyo (localidad, nombre) ya existe, sin fusionar', () => {
    const p = plan([fila(2, '999', 'escuela 1')], [existente(7, '100', 'Escuela 1')])
    expect(p.altas).toEqual([])
    expect(p.cambios).toEqual([])
    expect(p.rechazos).toEqual([{ fila: 2, motivo: expect.stringMatching(/ya existe/i) }])
  })

  it('el choque cuenta también contra los inactivos y los que no tienen CUE', () => {
    const p = plan(
      [fila(2, '1', 'Escuela 1'), fila(3, '2', 'Escuela 2')],
      [existente(7, '100', 'Escuela 1', 3, false), existente(8, null, 'Escuela 2')],
    )
    expect(p.altas).toEqual([])
    expect(p.rechazos.map((r) => r.fila)).toEqual([2, 3])
  })

  it('rechaza un cambio que choca con otro establecimiento', () => {
    const p = plan([fila(2, '200', 'Escuela 1')], [existente(7, '100', 'Escuela 1'), existente(8, '200', 'Escuela 2')])
    expect(p.cambios).toEqual([])
    expect(p.rechazos).toEqual([{ fila: 2, motivo: expect.stringMatching(/choca/i) }])
  })

  it('rechaza un cambio de localidad que choca con el nombre ya existente allá', () => {
    const p = plan([fila(2, '200', 'Escuela 1', 'Oberá')], [existente(7, '100', 'Escuela 1', 2), existente(8, '200', 'Escuela 1', 3)])
    expect(p.cambios).toEqual([])
    expect(p.rechazos[0].motivo).toMatch(/choca/i)
  })
})

describe('planificar: idempotencia (criterio 2)', () => {
  const CSV = [
    fila(2, '100', 'Escuela 1', 'Posadas'),
    fila(3, '200', ' Escuela  2 ', 'OBERA'),
    fila(4, '300', 'Escuela 3', 'Pto. Iguazú'),
    fila(5, '400', 'Escuela 4 Nueva', 'Posadas'),
  ]
  const EQ = { 'pto. iguazu': 'Puerto Iguazú' }
  const BASE = [existente(1, '400', 'Escuela 4', 3, false), existente(2, null, 'Sin CUE', 3)]

  it('planificar sobre el resultado aplicado da 0 altas, 0 cambios y 0 rechazos', () => {
    const primero = planificar(CSV, BASE, LOCALIDADES, EQ)
    expect(primero.altas).toHaveLength(3)
    expect(primero.cambios).toHaveLength(1)
    expect(primero.rechazos).toEqual([])

    const despues = aplicar(BASE, primero)
    const segundo = planificar(CSV, despues, LOCALIDADES, EQ)
    expect(segundo).toEqual({ altas: [], cambios: [], rechazos: [] })
  })

  it('tras aplicar, el establecimiento inactivo sigue inactivo (planificar no pidió tocarlo)', () => {
    const despues = aplicar(BASE, planificar(CSV, BASE, LOCALIDADES, EQ))
    expect(despues.find((e) => e.id === 1)?.activo).toBe(false)
  })
})

describe('planificar: nombres que existen en el prototipo de un objeto', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'la localidad %s es desconocida, no revienta',
    (localidad) => {
      const p = plan([fila(2, '1', 'Escuela 1', localidad)], [], {})
      expect(p.rechazos).toEqual([{ fila: 2, motivo: expect.stringMatching(/localidad desconocida/i) }])
    },
  )

  it('una equivalencia propia con el nombre de una propiedad heredada sigue funcionando', () => {
    const p = plan([fila(2, '1', 'Escuela 1', 'constructor')], [], { constructor: 'Posadas' })
    expect(p.altas[0].localidad_id).toBe(3)
  })
})
