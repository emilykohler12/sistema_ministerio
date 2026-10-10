// Carga del padrón de establecimientos desde un CSV (ADR 0019, docs/specs/padron/fase-b.md).
//
//   npm run padron:importar -- <csv>                       simula: imprime el informe y no escribe
//   npm run padron:importar -- <csv> --aplicar             escribe en el Supabase local
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run padron:importar -- <csv> --aplicar --confirmar=<host>
//
// Usa supabase-js con service_role: la auditoría registra usuario_id NULL. Salida 1 si hubo rechazos o errores.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/shared/types/database.ts'
import { resolverDestino } from './lib/entorno.ts'
import { supabaseLocal } from './lib/supabaseLocal.ts'
import { decodificarCsv, leerFilas } from './padron/csv.ts'
import { EQUIVALENCIAS } from './padron/equivalencias.ts'
import { planificar } from './padron/planificar.ts'
import type { Existente, Localidad, Rechazo } from './padron/planificar.ts'

type Cliente = SupabaseClient<Database>

const PAGINA = 1000
const CODIGO_UNICO = '23505'

function leerArgumentos(args: string[]) {
  let csv: string | undefined
  let aplicar = false
  for (const arg of args) {
    if (arg === '--aplicar') aplicar = true
    else if (arg === '--confirmar' || arg.startsWith('--confirmar=')) continue
    else if (arg.startsWith('--')) throw new Error(`Opción desconocida: ${arg}`)
    else if (csv === undefined) csv = arg
    else throw new Error(`Sobra un argumento: ${arg}`)
  }
  if (csv === undefined) throw new Error('Uso: padron:importar -- <csv> [--aplicar] [--confirmar=<host>]')
  return { csv, aplicar }
}

function conectarLocal(): { cliente: Cliente; etiqueta: string } {
  const { url, clave } = supabaseLocal()
  return { cliente: createClient<Database>(url, clave), etiqueta: `local (${url})` }
}

function conectar(args: string[]): { cliente: Cliente; etiqueta: string } {
  const destino = resolverDestino(process.env, args)
  if (destino.modo === 'local') return conectarLocal()
  return { cliente: createClient<Database>(destino.url, destino.clave), etiqueta: `nube (${destino.host})` }
}

async function traerTodo<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: Error | null }>) {
  const filas: T[] = []
  let desde = 0
  for (;;) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1)
    if (error) throw error
    // Se corta con una página vacía, no con una corta, y se avanza por lo recibido: el max_rows del servidor
    // (configurable en la nube) puede ser menor que PAGINA.
    if (!data?.length) return filas
    filas.push(...data)
    desde += data.length
  }
}

async function main() {
  const args = process.argv.slice(2)
  const { csv, aplicar } = leerArgumentos(args)
  const filas = leerFilas(decodificarCsv(readFileSync(csv)))

  // resolverDestino aborta antes de que se lea nada de la base si falta algo.
  const { cliente, etiqueta } = conectar(args)
  console.log(`Destino: ${etiqueta}. Modo: ${aplicar ? 'APLICAR' : 'simulación (no escribe)'}.`)

  const localidades: Localidad[] = await traerTodo((d, h) =>
    cliente.from('localidad').select('id, nombre').order('id').range(d, h),
  )
  const existentes: Existente[] = await traerTodo((d, h) =>
    cliente.from('establecimiento').select('id, cue, nombre, localidad_id, activo').order('id').range(d, h),
  )

  const plan = planificar(filas, existentes, localidades, EQUIVALENCIAS)
  const rechazos: Rechazo[] = [...plan.rechazos]
  const nombreLocalidad = new Map(localidades.map((l) => [l.id, l.nombre]))
  const donde = (id: number) => nombreLocalidad.get(id) ?? String(id)

  console.log(`\nCSV: ${filas.length} filas. Base: ${existentes.length} establecimientos.`)
  console.log(`\nAltas (${plan.altas.length})`)
  for (const a of plan.altas) console.log(`  fila ${a.fila}: CUE ${a.cue} · ${a.nombre} · ${donde(a.localidad_id)}`)
  console.log(`\nCambios (${plan.cambios.length})`)
  for (const c of plan.cambios) console.log(`  fila ${c.fila}: CUE ${c.cue} -> ${c.nombre} · ${donde(c.localidad_id)}`)

  let errorFatal: string | null = null
  let altasHechas = 0
  let cambiosHechos = 0
  if (aplicar) {
    console.log('\nEscribiendo...')
    for (const { fila, ...a } of plan.altas) {
      const { error } = await cliente.from('establecimiento').insert(a)
      if (!error) altasHechas++
      else if (error.code === CODIGO_UNICO) rechazos.push({ fila, motivo: `choque de unicidad al escribir (${error.message})` })
      else {
        errorFatal = `fila ${fila}: ${error.message}`
        break
      }
    }
    for (const { fila, id, nombre, localidad_id } of errorFatal ? [] : plan.cambios) {
      const { error } = await cliente.from('establecimiento').update({ nombre, localidad_id }).eq('id', id)
      if (!error) cambiosHechos++
      else if (error.code === CODIGO_UNICO) rechazos.push({ fila, motivo: `choque de unicidad al escribir (${error.message})` })
      else {
        errorFatal = `fila ${fila}: ${error.message}`
        break
      }
    }
    console.log(`Escritas: ${altasHechas} altas y ${cambiosHechos} cambios.`)
  }

  rechazos.sort((x, y) => x.fila - y.fila)
  console.log(`\nRechazos (${rechazos.length})`)
  for (const r of rechazos) console.log(`  fila ${r.fila}: ${r.motivo}`)

  console.log(
    aplicar
      ? `\nResumen: ${altasHechas} altas y ${cambiosHechos} cambios escritos, ${rechazos.length} rechazos.`
      : `\nResumen: ${plan.altas.length} altas, ${plan.cambios.length} cambios, ${rechazos.length} rechazos (simulación: no se escribió nada; usá --aplicar).`,
  )
  if (errorFatal) {
    console.error(`\nError al escribir, carga interrumpida: ${errorFatal}`)
    process.exit(1)
  }
  if (rechazos.length > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(`importar-padron: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
