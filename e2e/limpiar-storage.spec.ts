import { execFile } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { supabaseLocal } from '../scripts/lib/supabaseLocal.ts'

// Script de mantenimiento `storage:limpiar` (#28). Sin navegador: siembra con supabase-js y corre el script contra el Supabase local.
const { url, clave } = supabaseLocal()
const c = createClient(url, clave)
const pdf = new Blob(['%PDF-1.4 qa'], { type: 'application/pdf' })
const sufijo = Date.now().toString().slice(-6)
const uuid = (n: number) => `aaaaaaaa-0000-4000-8000-${sufijo}${String(n).padStart(6, '0')}.pdf`
const N = { ref: uuid(1), viejo: uuid(2), joven: uuid(3), falta: uuid(4) }

type Corrida = { code: number; out: string }
function limpiar(args: string[], env: Record<string, string> = {}): Promise<Corrida> {
  return new Promise((resolve) => {
    execFile('npm', ['run', 'storage:limpiar', '--', ...args], { env: { ...process.env, ...env }, timeout: 60_000 }, (e, stdout, stderr) => {
      const code = e ? ((e as { code?: number }).code ?? 1) : 0
      resolve({ code: typeof code === 'number' ? code : 1, out: `${stdout}\n${stderr}` })
    })
  })
}
async function subir(bucket: string, ruta: string) {
  const { error } = await c.storage.from(bucket).upload(ruta, pdf, { contentType: 'application/pdf' })
  expect(error, `${bucket}/${ruta}`).toBeNull()
}
const existe = async (bucket: string, ruta: string) => !(await c.storage.from(bucket).download(ruta)).error

test.describe.configure({ mode: 'serial' })
test.setTimeout(240_000)

let tid = 0
let carpetaSinTaller = ''
let rutas: Record<string, string> = {}

test('siembra viejos: referenciado y huérfano en cada bucket, carpeta sin taller y filas sin archivo', async () => {
  const { data: cat } = await c.from('categoria').insert({ nivel_id: 1, nombre: `QA huerf ${sufijo}` }).select().single()
  const { data: t } = await c
    .from('taller')
    .insert({ categoria_id: cat!.id, nombre: `QA huerf ${sufijo}`, descripcion: 'qa', estado: 'PUBLICADO' })
    .select()
    .single()
  tid = t!.id
  carpetaSinTaller = `${900000 + Number(sufijo.slice(-3))}`
  rutas = {
    tRef: `${tid}/ref.pdf`,
    tViejo: `${tid}/viejo.pdf`,
    tJoven: `${tid}/joven.pdf`,
    tSinTaller: `${carpetaSinTaller}/viejo.pdf`,
  }
  await subir('talleres', rutas.tRef)
  await subir('talleres', rutas.tViejo)
  await subir('talleres', rutas.tSinTaller)
  await subir('normativas', N.ref)
  await subir('normativas', N.viejo)
  const r = await c.from('recurso').insert([
    { taller_id: tid, nombre: 'ref', orden: 1, tipo: 'PDF', ruta_archivo: rutas.tRef, tamanio_bytes: 11 },
    { taller_id: tid, nombre: 'sin archivo', orden: 2, tipo: 'PDF', ruta_archivo: `${tid}/falta.pdf`, tamanio_bytes: 11 },
  ])
  expect(r.error).toBeNull()
  const n = await c.from('normativa').insert([
    { anio: 2024, numero: `QA-${sufijo}-1`, titulo: 'QA ref', ruta_archivo: N.ref },
    { anio: 2024, numero: `QA-${sufijo}-2`, titulo: 'QA sin archivo', ruta_archivo: N.falta },
  ])
  expect(n.error).toBeNull()
})

test('4. argumentos inválidos: salen con 1 sin conectar', async () => {
  for (const arg of ['--edad-minima=x', '--edad-minima=-1', '--edad-minima=', '--edad-minima', '--edad-minima 5', '--aplicar=1', '--foo', 'suelto']) {
    const r = await limpiar([arg])
    console.log(`ARG ${arg} -> ${r.code}\n${r.out.split('\n').filter((l) => /limpiar-storage|Destino/.test(l)).join('\n')}`)
    expect(r.code, arg).toBe(1)
    expect(r.out, arg).not.toContain('Destino:')
  }
  expect(await existe('talleres', rutas.tViejo)).toBe(true)
})

test('6. alta en curso con edad por defecto (60): nada se borra, ni con --aplicar', async () => {
  const sim = await limpiar([])
  console.log(sim.out)
  expect(sim.code).toBe(0)
  const ap = await limpiar(['--aplicar'])
  console.log(ap.out)
  expect(ap.code).toBe(0)
  expect(ap.out).toContain('0 huérfanos borrados')
  expect(await existe('talleres', rutas.tViejo)).toBe(true)
  expect(await existe('normativas', N.viejo)).toBe(true)
  expect(await existe('talleres', rutas.tSinTaller)).toBe(true)
})

test('5. falla cerrada: destino inalcanzable y clave inválida contra el local', async () => {
  const a = await limpiar(['--aplicar', '--edad-minima=0', '--confirmar=qa-inexistente.invalid'], {
    SUPABASE_URL: 'http://qa-inexistente.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
  })
  console.log('INALCANZABLE', a.code, a.out)
  expect(a.code).toBe(1)
  const b = await limpiar(['--aplicar', '--edad-minima=0', '--confirmar=localhost.:54321'], {
    SUPABASE_URL: 'http://localhost.:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'clave-invalida',
  })
  console.log('CLAVE INVALIDA', b.code, b.out)
  expect(b.code).toBe(1)
  expect(await existe('talleres', rutas.tViejo)).toBe(true)
  expect(await existe('normativas', N.viejo)).toBe(true)
})

test('espera a que los viejos tengan más de un minuto y siembra los jóvenes', async () => {
  await expect
    .poll(
      async () => {
        const { data } = await c.storage.from('normativas').list('', { search: N.viejo })
        const creado = data?.[0]?.created_at
        return creado ? Date.now() - new Date(creado).getTime() : 0
      },
      { timeout: 120_000, intervals: [5_000] },
    )
    .toBeGreaterThan(65_000)
  await subir('talleres', rutas.tJoven)
  await subir('normativas', N.joven)
})

test('2. simulación con --edad-minima=1: informa y no borra', async () => {
  const r = await limpiar(['--edad-minima=1'])
  console.log(r.out)
  expect(r.code).toBe(0)
  expect(r.out).toContain(rutas.tViejo)
  expect(r.out).toContain(N.viejo)
  expect(r.out).toContain(rutas.tSinTaller)
  expect(r.out).toContain(rutas.tJoven)
  expect(r.out).toContain(N.joven)
  expect(r.out).toContain(`${tid}/falta.pdf`)
  expect(r.out).toContain(N.falta)
  expect(r.out).toContain('simulación: no se borró nada')
  expect(await existe('talleres', rutas.tViejo)).toBe(true)
  expect(await existe('normativas', N.viejo)).toBe(true)
  expect(await existe('talleres', rutas.tSinTaller)).toBe(true)
})

test('3. --aplicar borra solo los huérfanos viejos; los referenciados siguen descargables', async () => {
  const r = await limpiar(['--aplicar', '--edad-minima=1'])
  console.log(r.out)
  expect(r.code).toBe(0)
  expect(await existe('talleres', rutas.tViejo)).toBe(false)
  expect(await existe('talleres', rutas.tSinTaller)).toBe(false)
  expect(await existe('normativas', N.viejo)).toBe(false)
  expect(await existe('talleres', rutas.tRef)).toBe(true)
  expect(await existe('normativas', N.ref)).toBe(true)
  expect(await existe('talleres', rutas.tJoven)).toBe(true)
  expect(await existe('normativas', N.joven)).toBe(true)
  const { data: firmada } = await c.storage.from('talleres').createSignedUrl(rutas.tRef, 60)
  expect((await fetch(firmada!.signedUrl)).status).toBe(200)
  expect((await fetch(c.storage.from('normativas').getPublicUrl(N.ref).data.publicUrl)).status).toBe(200)
})

test('7. idempotencia: la segunda corrida no encuentra nada', async () => {
  const r = await limpiar(['--aplicar', '--edad-minima=1'])
  console.log(r.out)
  expect(r.code).toBe(0)
  expect(r.out).toContain('0 huérfanos borrados')
  expect(r.out).not.toContain(rutas.tViejo)
})

test('limpieza de lo sembrado', async () => {
  await c.storage.from('talleres').remove([rutas.tRef, rutas.tJoven])
  await c.storage.from('normativas').remove([N.ref, N.joven])
})
