// Limpieza de archivos huérfanos en Storage (issue #28, ADR 0016).
//
//   npm run storage:limpiar                              simula: imprime el informe y no borra nada
//   npm run storage:limpiar -- --aplicar                 borra en el Supabase local
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run storage:limpiar -- --aplicar --confirmar=<host>
//   --edad-minima=<minutos>                              por defecto 60: un objeto más joven no se toca
//
// Un huérfano es un objeto de `talleres` o `normativas` que ninguna fila referencia. El alta sube primero e inserta después,
// por eso una subida en curso parece huérfana y se protege con la edad mínima. Falla cerrada: si algún listado o consulta
// falla no se borra nada. Usa supabase-js con service_role. Salida 1 si hubo errores.
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/shared/types/database.ts'
import { resolverDestino } from './lib/entorno.ts'
import { supabaseLocal } from './lib/supabaseLocal.ts'
import { leerArgumentos } from './storage/argumentos.ts'
import { traerPorClave } from './storage/paginar.ts'
import { planificar } from './storage/planificar.ts'
import type { Objeto, Referencias } from './storage/planificar.ts'

type Cliente = SupabaseClient<Database>

const PAGINA = 1000
const PAGINA_LISTADO = 100
const LOTE_BORRADO = 100
const BUCKETS = ['talleres', 'normativas']

function conectarLocal(): { cliente: Cliente; etiqueta: string } {
  const { url, clave } = supabaseLocal()
  return { cliente: createClient<Database>(url, clave), etiqueta: `local (${url})` }
}

function conectar(args: string[]): { cliente: Cliente; etiqueta: string } {
  const destino = resolverDestino(process.env, args)
  if (destino.modo === 'local') return conectarLocal()
  return { cliente: createClient<Database>(destino.url, destino.clave), etiqueta: `nube (${destino.host})` }
}

/** Lista todos los objetos del bucket, entrando a las carpetas (`talleres` tiene una por taller). */
async function listarBucket(cliente: Cliente, bucket: string): Promise<Objeto[]> {
  const objetos: Objeto[] = []
  const pendientes = ['']
  for (let prefijo = pendientes.shift(); prefijo !== undefined; prefijo = pendientes.shift()) {
    let offset = 0
    for (;;) {
      const { data, error } = await cliente.storage
        .from(bucket)
        .list(prefijo, { limit: PAGINA_LISTADO, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error(`No se pudo listar ${bucket}/${prefijo}: ${error.message}`)
      if (!data?.length) break
      for (const item of data) {
        const ruta = prefijo ? `${prefijo}/${item.name}` : item.name
        // Una carpeta no trae id; un objeto sí.
        if (item.id === null) pendientes.push(ruta)
        else objetos.push({ bucket, ruta, creado: item.created_at, tamanio: item.metadata?.size ?? 0 })
      }
      offset += data.length
    }
  }
  return objetos
}

async function leerReferencias(cliente: Cliente): Promise<Referencias> {
  // Por clave y no por offset: si se borra una fila mientras se lee, no se salta ninguna ruta referenciada.
  const recursos = await traerPorClave(
    (ultimoId, limite) =>
      cliente
        .from('recurso')
        .select('id, ruta_archivo')
        .not('ruta_archivo', 'is', null)
        .gt('id', ultimoId)
        .order('id')
        .limit(limite),
    PAGINA,
  )
  const normativas = await traerPorClave(
    (ultimoId, limite) => cliente.from('normativa').select('id, ruta_archivo').gt('id', ultimoId).order('id').limit(limite),
    PAGINA,
  )
  return {
    talleres: recursos.flatMap((r) => (r.ruta_archivo ? [r.ruta_archivo] : [])),
    normativas: normativas.map((n) => n.ruta_archivo),
  }
}

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`

async function main() {
  const args = process.argv.slice(2)
  const { aplicar, edadMinima } = leerArgumentos(args)

  // resolverDestino aborta antes de que se lea nada de la base si falta algo.
  const { cliente, etiqueta } = conectar(args)
  console.log(`Destino: ${etiqueta}. Modo: ${aplicar ? 'APLICAR' : 'simulación (no borra)'}. Edad mínima: ${edadMinima} min.`)

  // Todo se lee antes de borrar; cualquier error lanza y sale con 1 sin haber tocado nada. Se lista primero y se lee la
  // base después: una fila nueva que referencie un objeto ya listado quedará en las referencias.
  const objetos: Objeto[] = []
  for (const bucket of BUCKETS) objetos.push(...(await listarBucket(cliente, bucket)))
  const referencias = await leerReferencias(cliente)

  const plan = planificar(objetos, referencias, new Date(), edadMinima)

  for (const bucket of BUCKETS) {
    const p = plan[bucket]
    const bytes = p.huerfanos.reduce((suma, o) => suma + o.tamanio, 0)
    console.log(`\n${bucket}: ${objetos.filter((o) => o.bucket === bucket).length} objetos`)
    console.log(`  Conservados (referenciados): ${p.conservados.length}`)
    console.log(`  Jóvenes (no se tocan): ${p.jovenes.length}`)
    for (const o of p.jovenes) console.log(`    ${o.ruta} (${o.creado ?? 'sin fecha'})`)
    console.log(`  Filas sin archivo (solo se informan): ${p.sinArchivo.length}`)
    for (const ruta of p.sinArchivo) console.log(`    ${ruta}`)
    console.log(`  Huérfanos: ${p.huerfanos.length} (${kib(bytes)})`)
    for (const o of p.huerfanos) console.log(`    ${o.ruta} (${o.creado}, ${kib(o.tamanio)})`)
  }

  const huerfanos = BUCKETS.flatMap((bucket) => plan[bucket].huerfanos)
  let borrados = 0
  let errorFatal: string | null = null
  if (aplicar) {
    console.log('\nBorrando...')
    for (const bucket of BUCKETS) {
      const rutas = plan[bucket].huerfanos.map((o) => o.ruta)
      for (let i = 0; i < rutas.length && !errorFatal; i += LOTE_BORRADO) {
        const lote = rutas.slice(i, i + LOTE_BORRADO)
        const { data, error } = await cliente.storage.from(bucket).remove(lote)
        if (error) errorFatal = `${bucket}: ${error.message}`
        else {
          borrados += data.length
          // remove() devuelve solo lo que borró: menos de lo pedido es un error (la RLS lo oculta o no existe).
          if (data.length < lote.length) errorFatal = `${bucket}: se pidió borrar ${lote.length} objetos y se borraron ${data.length}`
        }
      }
    }
    console.log(`Borrados: ${borrados} de ${huerfanos.length}.`)
  }

  console.log(
    aplicar
      ? `\nResumen: ${borrados} huérfanos borrados.`
      : `\nResumen: ${huerfanos.length} huérfanos (simulación: no se borró nada; usá --aplicar).`,
  )
  if (errorFatal) {
    console.error(`\nError al borrar, limpieza interrumpida: ${errorFatal}`)
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  console.error(`limpiar-storage: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
