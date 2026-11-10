// Plan de la limpieza de huérfanos en Storage (issue #28, ADR 0016). Puro: recibe lo listado de Storage y las rutas
// que referencia la base, y devuelve qué se puede borrar. No toca la base ni Storage.

export interface Objeto {
  bucket: string
  /** Ruta completa dentro del bucket, con carpeta (`<taller_id>/<uuid>.pdf`). */
  ruta: string
  /** `created_at` del listado de Storage, en ISO. Nulo si el listado no lo trajo. */
  creado: string | null
  tamanio: number
}

/** Clave: bucket. Valor: rutas que alguna fila referencia. */
export type Referencias = Record<string, string[]>

export interface PlanBucket {
  /** Sin referencia y con al menos la edad mínima: lo único que se borra. */
  huerfanos: Objeto[]
  /** Con referencia: nunca se borran. */
  conservados: Objeto[]
  /** Sin referencia pero más nuevos que la edad mínima, o sin fecha legible: no se tocan (puede ser una subida en curso). */
  jovenes: Objeto[]
  /** Rutas referenciadas por una fila a las que no corresponde ningún objeto. Solo se informan. */
  sinArchivo: string[]
}

export type Plan = Record<string, PlanBucket>

const MS_POR_MINUTO = 60_000

export function planificar(objetos: Objeto[], referencias: Referencias, ahora: Date, edadMinimaMin: number): Plan {
  const buckets = new Set([...Object.keys(referencias), ...objetos.map((o) => o.bucket)])
  const limite = ahora.getTime() - edadMinimaMin * MS_POR_MINUTO
  const plan: Plan = {}

  for (const bucket of buckets) {
    const referenciadas = new Set(referencias[bucket] ?? [])
    const delBucket = objetos.filter((o) => o.bucket === bucket)
    const presentes = new Set(delBucket.map((o) => o.ruta))
    const parcial: PlanBucket = {
      huerfanos: [],
      conservados: [],
      jovenes: [],
      sinArchivo: [...referenciadas].filter((ruta) => !presentes.has(ruta)),
    }

    for (const o of delBucket) {
      if (referenciadas.has(o.ruta)) {
        parcial.conservados.push(o)
        continue
      }
      // Falla cerrada: sin fecha legible no se puede probar que sea vieja, así que no se borra.
      const creado = o.creado === null ? Number.NaN : Date.parse(o.creado)
      if (Number.isNaN(creado) || creado > limite) parcial.jovenes.push(o)
      else parcial.huerfanos.push(o)
    }
    plan[bucket] = parcial
  }
  return plan
}
