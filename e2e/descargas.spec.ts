import { expect, test, type Page } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
)

/** Crea un taller publicado con un PDF (renombrado) y, opcional, un enlace. Devuelve id y la ruta del objeto en Storage. */
async function tallerConArchivo(page: Page, s: string, nombreRecurso: string, conEnlace = false) {
  let ruta = ''
  page.on('request', (r) => {
    const m = /\/storage\/v1\/object\/talleres\/(.+)$/.exec(r.url())
    if (m && r.method() === 'POST') ruta = decodeURIComponent(m[1])
  })
  const id = await crearTaller(page, { nombre: `Taller Desc ${s}`, categoria: `Cat Desc ${s}`, estado: 'Publicado' })
  await page.locator('input[type=file]').first().setInputFiles({ name: `base${s}.pdf`, mimeType: 'application/pdf', buffer: PDF })
  const item = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Editar base${s}` }) })
  await expect(item).toHaveCount(1)
  await page.getByRole('button', { name: `Editar base${s}` }).click()
  await page.getByRole('dialog').getByLabel('Nombre').fill(nombreRecurso)
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(nombreRecurso, { exact: true })).toBeVisible()
  if (conEnlace) {
    await page.getByRole('button', { name: 'Agregar enlace' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Nombre').fill(`Enlace ${s}`)
    await dlg.getByLabel('URL').fill('https://example.com/material')
    await dlg.getByRole('button', { name: 'Agregar' }).click()
    await expect(page.getByText(`Enlace ${s}`, { exact: true })).toBeVisible()
  }
  expect(ruta).not.toBe('')
  return { id, ruta, urlRecursos: page.url() }
}

async function cambiarEstado(page: Page, urlRecursos: string, estado: 'Borrador' | 'Publicado') {
  await page.goto(urlRecursos.replace(/\/recursos$/, '/editar'))
  await page.getByLabel('Estado').selectOption({ label: estado })
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page).not.toHaveURL(/\/editar$/)
}

async function abrirModal(anon: Page, id: number) {
  await anon.goto(`/talleres/${id}`)
  await anon.getByRole('button', { name: 'Descargar' }).first().click()
  return anon.getByRole('dialog')
}

async function completar(dlg: ReturnType<Page['getByRole']>, datos: { cargo: string; cargoOtro?: string; localidad: string; institucion: string; otra?: string }) {
  await dlg.getByLabel('Cargo').selectOption({ label: datos.cargo })
  if (datos.cargoOtro) await dlg.getByLabel('Especificá tu cargo').fill(datos.cargoOtro)
  await dlg.getByLabel('Localidad').selectOption({ label: datos.localidad })
  await expect(dlg.getByLabel('Institución')).toBeEnabled()
  await expect(dlg.getByLabel('Institución').getByRole('option', { name: 'Otra' })).toHaveCount(1)
  await dlg.getByLabel('Institución').selectOption({ label: datos.institucion })
  if (datos.otra) await dlg.getByLabel('Nombre de la institución').fill(datos.otra)
  await dlg.getByRole('button', { name: 'Descargar' }).click()
}

async function crearEstablecimiento(page: Page, localidad: string, nombre: string) {
  await page.goto('/admin/establecimientos/nuevo')
  await page.getByLabel('Nombre del establecimiento').fill(nombre)
  await page.getByLabel('Localidad').selectOption({ label: localidad })
  await page.getByRole('button', { name: 'Crear establecimiento' }).click()
  await expect(page).toHaveURL(/\/admin\/establecimientos\?localidad=/)
}

test('descarga: registro, lista, nombre del PDF, reapertura, otro taller y Otro/Otra', async ({ page, browser }) => {
  const s = sufijoUnico()
  const escuela = `Escuela Desc ${s}`
  await loginAdmin(page)
  await crearEstablecimiento(page, 'Posadas', escuela)
  const a = await tallerConArchivo(page, s, 'Guía / 1°', true)
  const sB = `${s}b`
  const b = await tallerConArchivo(page, sB, `Otro doc ${sB}`)

  const anon = await (await browser.newContext({ acceptDownloads: true })).newPage()
  // Taller sin sesión: formulario, validación vacía.
  let dlg = await abrirModal(anon, a.id)
  await dlg.getByRole('button', { name: 'Descargar' }).click()
  await expect(dlg.locator('[aria-invalid="true"]').first()).toBeVisible()
  await completar(dlg, { cargo: 'Docente', localidad: 'Posadas', institucion: escuela })

  // Lista con tamaño total, enlace y nombre del archivo descargado.
  await expect(dlg.getByText(/Tamaño total/)).toBeVisible()
  await expect(dlg.getByRole('link', { name: `Enlace ${s}` })).toHaveAttribute('target', '_blank')
  const [descarga] = await Promise.all([anon.waitForEvent('download'), dlg.getByRole('link', { name: 'Guía / 1°' }).click()])
  expect(descarga.suggestedFilename()).toBe('Guia - 1-.pdf')

  // Reabrir el mismo taller: directo a la lista.
  dlg = await abrirModal(anon, a.id)
  await expect(dlg.getByText(/Tamaño total/)).toBeVisible()
  await expect(dlg.getByLabel('Cargo')).toHaveCount(0)
  await anon.keyboard.press('Escape')

  // Otro taller: formulario precargado; confirma y registra.
  dlg = await abrirModal(anon, b.id)
  await expect(dlg.getByLabel('Cargo')).toHaveValue('Docente')
  await expect(dlg.getByLabel('Localidad')).toHaveValue('58')
  await expect(dlg.getByLabel('Institución').locator('option:checked')).toHaveText(escuela)
  await dlg.getByRole('button', { name: 'Descargar' }).click()
  await expect(dlg.getByText(/Tamaño total/)).toBeVisible()

  // "Otro" cargo y "Otra" institución en una visita nueva.
  const anon2 = await (await browser.newContext()).newPage()
  dlg = await abrirModal(anon2, a.id)
  await dlg.getByRole('button', { name: 'Descargar' }).click()
  await completar(dlg, { cargo: 'Otro', localidad: 'Posadas', institucion: 'Otra' })
  await expect(dlg.getByLabel('Especificá tu cargo')).toHaveAttribute('aria-invalid', 'true')
  await dlg.getByLabel('Especificá tu cargo').fill('Bibliotecario/a')
  await dlg.getByLabel('Nombre de la institución').fill('Escuela privada sin padrón')
  await dlg.getByRole('button', { name: 'Descargar' }).click()
  await expect(dlg.getByText(/Tamaño total/)).toBeVisible()
})

test('descarga: DA003 con el taller pasado a borrador y firma rechazada para anon', async ({ page, browser }) => {
  const s = sufijoUnico()
  await loginAdmin(page)
  const t = await tallerConArchivo(page, s, `Doc ${s}`)

  const anon = await (await browser.newContext()).newPage()
  let apikey = ''
  let origen = ''
  anon.on('request', (r) => {
    const k = r.headers()['apikey']
    if (k && r.url().includes('/rest/v1/')) {
      apikey = k
      origen = new URL(r.url()).origin
    }
  })
  const firmar = () =>
    anon.evaluate(
      async ([o, k, ruta]) => {
        const r = await fetch(`${o}/storage/v1/object/sign/talleres/${ruta}`, {
          method: 'POST',
          headers: { apikey: k, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresIn: 60 }),
        })
        return { status: r.status, cuerpo: await r.text() }
      },
      [origen, apikey, t.ruta] as const,
    )

  const dlg = await abrirModal(anon, t.id)
  expect(apikey).not.toBe('')
  const publicado = await firmar()
  console.log('firma (publicado):', publicado.status)
  expect(publicado.status).toBe(200)

  // El admin lo despublica con el modal abierto.
  await cambiarEstado(page, t.urlRecursos, 'Borrador')
  const borrador = await firmar()
  console.log('firma (borrador):', borrador.status, borrador.cuerpo)
  expect(borrador.status).toBeGreaterThanOrEqual(400)

  await completar(dlg, { cargo: 'Docente', localidad: 'Posadas', institucion: 'Sin institución' })
  await expect(dlg.getByText('Este taller ya no está disponible')).toBeVisible()
  await dlg.getByRole('button', { name: /cerrar/i }).click()
  await expect(anon.getByText('Taller no encontrado')).toBeVisible()
})
