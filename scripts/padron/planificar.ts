// Plan de la carga del padrón (ADR 0019). Puro: recibe lo leído del CSV y de la base, devuelve qué escribir y qué rechazar.
import { normalizar } from '../../src/shared/lib/texto.ts'
import type { FilaCsv } from './csv.ts'

export type { FilaCsv }

export interface Existente {
  id: number
  cue: string | null
  nombre: string
  localidad_id: number
  activo: boolean
}

export interface Localidad {
  id: number
  nombre: string
}

/** Clave: localidad del CSV normalizada. Valor: nombre de una localidad de la base. */
export type Equivalencias = Record<string, string>

export interface Alta {
  fila: number
  cue: string
  nombre: string
  localidad_id: number
}

export interface Cambio extends Alta {
  id: number
}

export interface Rechazo {
  fila: number
  motivo: string
}

export interface Plan {
  altas: Alta[]
  cambios: Cambio[]
  rechazos: Rechazo[]
}

const CUE = /^[0-9]{1,20}$/
const MAX_NOMBRE = 200

/** Quita los espacios de los extremos (incluido U+00A0) y deja los internos repetidos en uno. */
function limpiar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

const clave = (texto: string) => normalizar(limpiar(texto))
const claveNombre = (localidadId: number, nombre: string) => `${localidadId}|${clave(nombre)}`

export function planificar(
  filas: FilaCsv[],
  existentes: Existente[],
  localidades: Localidad[],
  equivalencias: Equivalencias,
): Plan {
  const plan: Plan = { altas: [], cambios: [], rechazos: [] }

  const localidadPorNombre = new Map(localidades.map((l) => [clave(l.nombre), l.id]))
  const resolverLocalidad = (texto: string): number | undefined => {
    const k = clave(texto)
    const directa = localidadPorNombre.get(k)
    if (directa !== undefined) return directa
    // hasOwn: "constructor" o "toString" no son equivalencias aunque estén en el prototipo del objeto.
    return Object.hasOwn(equivalencias, k) ? localidadPorNombre.get(clave(equivalencias[k])) : undefined
  }

  const porCue = new Map<string, Existente>()
  const dueñoDeNombre = new Map<string, number>()
  for (const e of existentes) {
    if (e.cue !== null) porCue.set(e.cue, e)
    dueñoDeNombre.set(claveNombre(e.localidad_id, e.nombre), e.id)
  }

  const cuesVistos = new Set<string>()
  const nombresVistos = new Set<string>()

  for (const f of filas) {
    const rechazar = (motivo: string) => plan.rechazos.push({ fila: f.fila, motivo })

    const cue = f.cue.trim()
    if (cue === '') {
      rechazar('sin CUE')
      continue
    }
    if (!CUE.test(cue)) {
      rechazar(`CUE inválido (${cue}): debe tener de 1 a 20 dígitos`)
      continue
    }
    const nombre = limpiar(f.nombre)
    if (nombre === '') {
      rechazar('nombre vacío')
      continue
    }
    if (nombre.length > MAX_NOMBRE) {
      rechazar(`nombre de más de ${MAX_NOMBRE} caracteres`)
      continue
    }
    const localidadId = resolverLocalidad(f.localidad)
    if (localidadId === undefined) {
      rechazar(`localidad desconocida (${limpiar(f.localidad) || 'vacía'})`)
      continue
    }

    if (cuesVistos.has(cue)) {
      rechazar(`CUE repetido en el CSV (${cue})`)
      continue
    }
    cuesVistos.add(cue)

    const k = claveNombre(localidadId, nombre)
    if (nombresVistos.has(k)) {
      rechazar('localidad y nombre repetidos en el CSV')
      continue
    }

    const actual = porCue.get(cue)
    const dueño = dueñoDeNombre.get(k)
    if (actual === undefined) {
      if (dueño !== undefined) {
        rechazar('ya existe un establecimiento con esa localidad y nombre')
        continue
      }
      nombresVistos.add(k)
      plan.altas.push({ fila: f.fila, cue, nombre, localidad_id: localidadId })
      continue
    }

    nombresVistos.add(k)
    if (actual.nombre === nombre && actual.localidad_id === localidadId) continue
    if (dueño !== undefined && dueño !== actual.id) {
      nombresVistos.delete(k)
      rechazar('el cambio choca con otro establecimiento de esa localidad y nombre')
      continue
    }
    plan.cambios.push({ fila: f.fila, id: actual.id, cue, nombre, localidad_id: localidadId })
  }

  return plan
}
