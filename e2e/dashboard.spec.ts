import { expect, test, type Page } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
)

/** Hoy en Argentina como lo muestra el tablero (dd/m/aaaa sin ceros a la izquierda). */
function hoyComoSeVe() {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date())
    .split('-')
    .map(Number)
  return `${d}/${m}/${y}`
}

async function tallerConEnlace(page: Page, s: string) {
  const id = await crearTaller(page, { nombre: `Taller Dash ${s}`, categoria: `Cat Dash ${s}`, estado: 'Publicado' })
  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Nombre').fill(`Enlace ${s}`)
  await dlg.getByLabel('URL').fill('https://example.com/material')
  await dlg.getByRole('button', { name: 'Agregar' }).click()
  await expect(page.getByText(`Enlace ${s}`, { exact: true })).toBeVisible()
  return id
}

async function kpi(page: Page, etiqueta: string) {
  const texto = await page
    .getByRole('region', { name: 'Resumen' })
    .getByText(etiqueta, { exact: true })
    .locator('xpath=following-sibling::p')
    .innerText()
  return Number(texto.replace(/\./g, ''))
}

async function esperarTablero(page: Page) {
  await expect(page.getByRole('region', { name: 'Resumen' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumen' })).not.toHaveAttribute('aria-busy', 'true')
}

async function sinVincular(page: Page) {
  const aviso = page.getByText(/instituci(ón|ones) sin vincular/)
  if ((await aviso.count()) === 0) return 0
  return Number(/^(\d+)/.exec(await aviso.innerText())![1])
}

async function descargar(
  browser: import('@playwright/test').Browser,
  id: number,
  datos: { cargo: string; cargoOtro?: string; institucion: string; otra?: string },
) {
  const anon = await (await browser.newContext()).newPage()
  await anon.goto(`/talleres/${id}`)
  await anon.getByRole('button', { name: 'Descargar' }).first().click()
  const dlg = anon.getByRole('dialog')
  await dlg.getByLabel('Cargo').selectOption({ label: datos.cargo })
  if (datos.cargoOtro) await dlg.getByLabel('Especificá tu cargo').fill(datos.cargoOtro)
  await dlg.getByLabel('Localidad').selectOption({ label: 'Posadas' })
  await expect(dlg.getByLabel('Institución').getByRole('option', { name: 'Otra' })).toHaveCount(1)
  await dlg.getByLabel('Institución').selectOption({ label: datos.institucion })
  if (datos.otra) await dlg.getByLabel('Nombre de la institución').fill(datos.otra)
  await dlg.getByRole('button', { name: 'Descargar' }).click()
  await expect(dlg.getByText(/Tamaño total|Enlace/).first()).toBeVisible()
  await anon.context().close()
}

test('tablero: 3 descargas de talleres y una de normativa se ven en /admin', async ({ page, browser }) => {
  const s = sufijoUnico()
  const escuela = `Escuela Dash ${s}`
  const otra = `Privada Dash ${s}`
  const tituloNorma = `Norma Dash ${s}`
  await loginAdmin(page)

  await page.goto('/admin/establecimientos/nuevo')
  await page.getByLabel('Nombre del establecimiento').fill(escuela)
  await page.getByLabel('Localidad').selectOption({ label: 'Posadas' })
  await page.getByRole('button', { name: 'Crear establecimiento' }).click()
  await expect(page).toHaveURL(/\/admin\/establecimientos\?localidad=/)

  const a = await tallerConEnlace(page, `${s}a`)
  const b = await tallerConEnlace(page, `${s}b`)
  const c = await tallerConEnlace(page, `${s}c`)

  await page.goto('/admin/normativas/nueva')
  await page.getByLabel('Título').fill(tituloNorma)
  await page.getByLabel('Descripción').fill('Normativa del tablero')
  await page.getByLabel('Número').fill(`D-${s}`)
  await page.getByLabel('Año').fill('2024')
  await page.locator('input[type=file]').setInputFiles({ name: 'norma.pdf', mimeType: 'application/pdf', buffer: PDF })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/normativas$/)

  // Línea de base (otros specs dejan descargas en la misma base).
  await page.goto('/admin')
  await esperarTablero(page)
  const base = {
    descargas: await kpi(page, 'Descargas'),
    alcanzados: await kpi(page, 'Establecimientos alcanzados'),
    vincular: await sinVincular(page),
  }
  const hoy = hoyComoSeVe()
  const filaHoy = page.getByRole('row', { name: new RegExp(`^${hoy}`) })
  const hoyBase = (await filaHoy.count()) ? Number((await filaHoy.innerText()).trim().split(/\s+/).pop()) : 0

  await descargar(browser, a, { cargo: 'Docente', institucion: escuela })
  await descargar(browser, b, { cargo: 'Docente', institucion: 'Otra', otra })
  await descargar(browser, c, { cargo: 'Otro', cargoOtro: 'Bibliotecario/a', institucion: 'Sin institución' })

  const anon = await (await browser.newContext()).newPage()
  await anon.goto('/normativas')
  const enlace = anon.getByRole('link', { name: `Descargar ${tituloNorma}` })
  await expect(enlace).toBeVisible()
  await Promise.all([anon.waitForEvent('popup').catch(() => null), enlace.click()])
  await anon.context().close()

  await page.goto('/admin')
  await esperarTablero(page)
  await expect.poll(() => kpi(page, 'Descargas')).toBe(base.descargas + 3)
  expect(await kpi(page, 'Establecimientos alcanzados')).toBe(base.alcanzados + 1)
  expect(await sinVincular(page)).toBe(base.vincular + 1)

  // Serie: hoy suma 3 más.
  await expect(filaHoy).toBeVisible()
  expect(Number((await filaHoy.innerText()).trim().split(/\s+/).pop())).toBe(hoyBase + 3)

  // Ranking con los 3 talleres (cada uno con 1; el orden entre empates es por id).
  const ranking = page.getByRole('region', { name: 'Ranking de talleres' })
  for (const suf of ['a', 'b', 'c']) {
    await expect(ranking.getByRole('row', { name: new RegExp(`Taller Dash ${s}${suf}`) })).toContainText('1')
  }

  // Porcentajes: cada tabla suma ~100 %.
  for (const nombre of ['Descargas por nivel', 'Descargas por cargo']) {
    const celdas = await page
      .getByRole('region', { name: nombre })
      .getByRole('cell', { name: /%$/ })
      .allInnerTexts()
    const suma = celdas.reduce((t, x) => t + Number(x.replace('%', '').replace(',', '.').trim()), 0)
    expect(suma).toBeGreaterThan(99)
    expect(suma).toBeLessThan(101)
  }
  await expect(page.getByRole('region', { name: 'Descargas por cargo' }).getByRole('row', { name: /^Otro/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Descargas por nivel' }).getByRole('row', { name: /Inicial/ })).toBeVisible()

  // Normativa: histórico con 1.
  const normativas = page.getByRole('region', { name: 'Normativas' })
  await expect(normativas.getByText('Total histórico')).toBeVisible()
  await expect(normativas.getByRole('row', { name: new RegExp(tituloNorma) }).getByRole('cell').last()).toHaveText('1')
})

test('tablero: rango pasado en cero con estados vacíos, URL conservada y desde > hasta con error', async ({ page }) => {
  await loginAdmin(page)
  await page.getByRole('button', { name: 'Rango' }).click()
  await page.getByLabel('Desde').fill('2020-01-01')
  await page.getByLabel('Hasta').fill('2020-01-31')
  await expect(page).toHaveURL(/periodo=rango&desde=2020-01-01&hasta=2020-01-31/)
  await esperarTablero(page)
  await expect.poll(() => kpi(page, 'Descargas')).toBe(0)
  expect(await kpi(page, 'Establecimientos alcanzados')).toBe(0)
  await expect(page.getByText('Sin descargas en el período').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Descargas por nivel' }).getByText('Sin descargas en el período')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Descargas por cargo' }).getByText('Sin descargas en el período')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Desde')).toHaveValue('2020-01-01')
  await expect(page.getByLabel('Hasta')).toHaveValue('2020-01-31')
  await esperarTablero(page)
  expect(await kpi(page, 'Descargas')).toBe(0)

  // desde > hasta: error junto a los campos, sin skeletons ni datos.
  await page.getByLabel('Desde').fill('2020-03-01')
  await expect(page.getByRole('alert').filter({ hasText: 'no puede ser posterior' })).toBeVisible()
  await expect(page.getByLabel('Desde')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Resumen' })).toHaveCount(0)

  // Fecha futura y anterior a 2020.
  await page.getByLabel('Desde').fill('2019-12-31')
  await expect(page.getByRole('alert').filter({ hasText: '01/01/2020' })).toBeVisible()
})

test('tablero: sin permiso de admin la RPC responde 42501 (y anon también falla)', async ({ page }) => {
  await page.goto('/talleres')
  let apikey = ''
  let origen = ''
  page.on('request', (r) => {
    const k = r.headers()['apikey']
    if (k && r.url().includes('/rest/v1/')) {
      apikey = k
      origen = new URL(r.url()).origin
    }
  })
  await page.reload()
  await expect.poll(() => apikey).not.toBe('')

  const res = await page.evaluate(
    async ([o, k]) => {
      const t = await fetch(`${o}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: k, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sin-permiso@dam.local', password: 'sin-permiso-dam-local' }),
      }).then((r) => r.json() as Promise<{ access_token: string }>)
      const llamar = async (token: string) => {
        const r = await fetch(`${o}/rest/v1/rpc/metricas_resumen`, {
          method: 'POST',
          headers: { apikey: k, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_desde: '2024-01-01', p_hasta: '2024-01-31' }),
        })
        return { status: r.status, cuerpo: await r.text() }
      }
      return { sinPermiso: await llamar(t.access_token), anon: await llamar(k) }
    },
    [origen, apikey] as const,
  )
  expect(res.sinPermiso.status).toBeGreaterThanOrEqual(400)
  expect(res.sinPermiso.cuerpo).toContain('42501')
  expect(res.anon.status).toBeGreaterThanOrEqual(400)
  expect(res.anon.cuerpo).toContain('42501')
})

// Regresión (qa.md): el contenedor flex del admin necesita min-w-0 y las tablas desplazan dentro de su sección.
test('tablero: en pantalla de celular no hay scroll horizontal', async ({ page }) => {
  await loginAdmin(page)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/admin')
  await esperarTablero(page)
  // Expresión en texto: el tsconfig de e2e no incluye los tipos del DOM.
  const anchoDoc = (await page.evaluate('document.documentElement.scrollWidth')) as number
  expect(anchoDoc).toBeLessThanOrEqual(360)
})
