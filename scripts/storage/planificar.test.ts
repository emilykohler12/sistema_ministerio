// @vitest-environment node
// Spec: docs/specs/limpieza-huerfanos/plan.md. planificar es puro: no toca la base ni Storage.
//
// Firmas asumidas:
//   Objeto     = { bucket: string; ruta: string; creado: string | null; tamanio: number }   creado: ISO de `created_at`
//   Referencias = Record<string, string[]>   bucket -> rutas que alguna fila referencia
//   planificar(objetos, referencias, ahora: Date, edadMinimaMin: number) -> Record<bucket, PlanBucket>
//   PlanBucket = { huerfanos: Objeto[]; conservados: Objeto[]; jovenes: Objeto[]; sinArchivo: string[] }
import { describe, expect, it } from 'vitest'
import { planificar } from './planificar.ts'
import type { Objeto } from './planificar.ts'

const AHORA = new Date('2026-11-10T12:00:00Z')
const VIEJO = '2026-11-09T12:00:00Z'
const JOVEN = '2026-11-10T11:30:00Z'

const objeto = (bucket: string, ruta: string, creado: string | null = VIEJO, tamanio = 100): Objeto => ({
  bucket,
  ruta,
  creado,
  tamanio,
})

describe('planificar', () => {
  it('conserva el objeto cuya ruta está referenciada, aunque sea viejo', () => {
    const o = objeto('talleres', '1/a.pdf')
    const plan = planificar([o], { talleres: ['1/a.pdf'] }, AHORA, 60)
    expect(plan.talleres.conservados).toEqual([o])
    expect(plan.talleres.huerfanos).toEqual([])
  })

  it('marca como huérfano el objeto viejo sin referencia', () => {
    const o = objeto('normativas', 'x.pdf')
    const plan = planificar([o], { normativas: [] }, AHORA, 60)
    expect(plan.normativas.huerfanos).toEqual([o])
    expect(plan.normativas.conservados).toEqual([])
    expect(plan.normativas.jovenes).toEqual([])
  })

  it('salta el objeto sin referencia más joven que la edad mínima', () => {
    const o = objeto('talleres', '1/b.pdf', JOVEN)
    const plan = planificar([o], { talleres: [] }, AHORA, 60)
    expect(plan.talleres.jovenes).toEqual([o])
    expect(plan.talleres.huerfanos).toEqual([])
  })

  it('un objeto de exactamente la edad mínima ya se puede borrar', () => {
    const o = objeto('talleres', '1/c.pdf', '2026-11-10T11:00:00Z')
    const plan = planificar([o], { talleres: [] }, AHORA, 60)
    expect(plan.talleres.huerfanos).toEqual([o])
  })

  it('con edad mínima 0 un objeto recién creado es huérfano', () => {
    const o = objeto('talleres', '1/d.pdf', '2026-11-10T12:00:00Z')
    expect(planificar([o], { talleres: [] }, AHORA, 0).talleres.huerfanos).toEqual([o])
  })

  it('un objeto joven y referenciado se conserva, no es joven', () => {
    const o = objeto('talleres', '1/e.pdf', JOVEN)
    const plan = planificar([o], { talleres: ['1/e.pdf'] }, AHORA, 60)
    expect(plan.talleres.conservados).toEqual([o])
    expect(plan.talleres.jovenes).toEqual([])
  })

  it('sin fecha legible no se toca: falla cerrada', () => {
    const sinFecha = objeto('talleres', '1/f.pdf', null)
    const mala = objeto('talleres', '1/g.pdf', 'no-es-fecha')
    const plan = planificar([sinFecha, mala], { talleres: [] }, AHORA, 60)
    expect(plan.talleres.huerfanos).toEqual([])
    expect(plan.talleres.jovenes).toEqual([sinFecha, mala])
  })

  it('un bucket sin objetos da un plan vacío', () => {
    const plan = planificar([], { talleres: [], normativas: [] }, AHORA, 60)
    expect(plan.talleres).toEqual({ huerfanos: [], conservados: [], jovenes: [], sinArchivo: [] })
    expect(plan.normativas).toEqual({ huerfanos: [], conservados: [], jovenes: [], sinArchivo: [] })
  })

  it('informa la referencia sin objeto y no la toca', () => {
    const plan = planificar([], { talleres: ['7/falta.pdf'] }, AHORA, 60)
    expect(plan.talleres.sinArchivo).toEqual(['7/falta.pdf'])
    expect(plan.talleres.huerfanos).toEqual([])
  })

  it('compara la ruta completa con carpeta, sin confundir el mismo nombre en otra carpeta', () => {
    const propio = objeto('talleres', '1/a.pdf')
    const ajeno = objeto('talleres', '2/a.pdf')
    const plan = planificar([propio, ajeno], { talleres: ['1/a.pdf'] }, AHORA, 60)
    expect(plan.talleres.conservados).toEqual([propio])
    expect(plan.talleres.huerfanos).toEqual([ajeno])
  })

  it('no mezcla buckets: la misma ruta referenciada en otro bucket no protege', () => {
    const o = objeto('normativas', 'u.pdf')
    const plan = planificar([o], { talleres: ['u.pdf'], normativas: [] }, AHORA, 60)
    expect(plan.normativas.huerfanos).toEqual([o])
    expect(plan.talleres.sinArchivo).toEqual(['u.pdf'])
  })

  it('reparte una mezcla de objetos', () => {
    const ref = objeto('talleres', '1/ref.pdf')
    const viejo = objeto('talleres', '1/viejo.pdf')
    const joven = objeto('talleres', '1/joven.pdf', JOVEN)
    const plan = planificar([ref, viejo, joven], { talleres: ['1/ref.pdf', '1/fila.pdf'] }, AHORA, 60)
    expect(plan.talleres).toEqual({
      huerfanos: [viejo],
      conservados: [ref],
      jovenes: [joven],
      sinArchivo: ['1/fila.pdf'],
    })
  })
})
