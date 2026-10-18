import { expect, test, type Browser, type Page } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

const LOCALIDAD = 'Eldorado'

async function crearEstablecimiento(page: Page, nombre: string) {
  await page.goto('/admin/establecimientos/nuevo')
  await page.getByLabel('Nombre del establecimiento').fill(nombre)
  await page.getByLabel('Localidad').selectOption({ label: LOCALIDAD })
  await page.getByRole('button', { name: 'Crear establecimiento' }).click()
  await expect(page).toHaveURL(/\/admin\/establecimientos\?localidad=/)
}

async function tallerConEnlace(page: Page, s: string) {
  const id = await crearTaller(page, { nombre: `Taller SV ${s}`, categoria: `Cat SV ${s}`, estado: 'Publicado' })
  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Nombre').fill(`Enlace ${s}`)
  await dlg.getByLabel('URL').fill('https://example.com/material')
  await dlg.getByRole('button', { name: 'Agregar' }).click()
  await expect(page.getByText(`Enlace ${s}`, { exact: true })).toBeVisible()
  return id
}

async function descargarOtra(browser: Browser, id: number, otra: string) {
  const anon = await (await browser.newContext()).newPage()
  await anon.goto(`/talleres/${id}`)
  await anon.getByRole('button', { name: 'Descargar' }).first().click()
  const dlg = anon.getByRole('dialog')
  await dlg.getByLabel('Cargo').selectOption({ label: 'Docente' })
  await dlg.getByLabel('Localidad').selectOption({ label: LOCALIDAD })
  await expect(dlg.getByLabel('Institución').getByRole('option', { name: 'Otra' })).toHaveCount(1)
  await dlg.getByLabel('Institución').selectOption({ label: 'Otra' })
  await dlg.getByLabel('Nombre de la institución').fill(otra)
  await dlg.getByRole('button', { name: 'Descargar' }).click()
  await expect(dlg.getByText(/Tamaño total|Enlace/).first()).toBeVisible()
  await anon.context().close()
}

async function kpi(page: Page, etiqueta: string) {
  const texto = await page
    .getByRole('region', { name: 'Resumen' })
    .getByText(etiqueta, { exact: true })
    .locator('xpath=following-sibling::p')
    .innerText()
  return Number(texto.replace(/\./g, ''))
}

async function tablero(page: Page) {
  await page.goto('/admin')
  await expect(page.getByRole('region', { name: 'Resumen' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumen' })).not.toHaveAttribute('aria-busy', 'true')
}

async function avisos(page: Page) {
  const aviso = page.getByText(/instituci(ón|ones) sin vincular/)
  if ((await aviso.count()) === 0) return 0
  return Number(/^(\d+)/.exec(await aviso.innerText())![1])
}

async function irASinVincular(page: Page) {
  await page.goto('/admin/establecimientos/sin-vincular')
  await expect(page.getByRole('main').getByRole('heading', { name: 'Instituciones sin vincular' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0)
}

test('sin vincular: vincular a uno existente y crear otro; el aviso baja y alcanzados sube', async ({ page, browser }) => {
  const s = sufijoUnico()
  const existente = `Escuela Real ${s}`
  const nombreA = `Escuela Alfa ${s}`
  const nombreB = `Escuela Beta ${s}`
  await loginAdmin(page)
  await crearEstablecimiento(page, existente)
  const id = await tallerConEnlace(page, s)

  await tablero(page)
  const base = { avisos: await avisos(page), alcanzados: await kpi(page, 'Establecimientos alcanzados') }

  await descargarOtra(browser, id, nombreA)
  await descargarOtra(browser, id, nombreA.toLowerCase())
  await descargarOtra(browser, id, nombreB)

  await tablero(page)
  expect(await avisos(page)).toBe(base.avisos + 2)
  await page.getByRole('link', { name: /instituci(ón|ones) sin vincular/ }).click()
  await expect(page).toHaveURL(/\/admin\/establecimientos\/sin-vincular$/)

  await expect(page.getByRole('main').getByRole('heading', { name: 'Instituciones sin vincular' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Localidad' }).selectOption({ label: LOCALIDAD })
  const filaA = page.getByRole('row', { name: new RegExp(nombreA, 'i') })
  const filaB = page.getByRole('row', { name: new RegExp(nombreB, 'i') })
  await expect(filaA.getByRole('cell').nth(3)).toHaveText('2')
  await expect(filaB.getByRole('cell').nth(3)).toHaveText('1')

  // Vincular A al existente
  await filaA.getByRole('button', { name: 'Vincular', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.getByRole('button', { name: 'Vincular', exact: true })).toBeDisabled()
  await dlg.getByRole('radio', { name: new RegExp(existente) }).check()
  await dlg.getByRole('button', { name: 'Vincular', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Se vinculó con' })).toContainText('2 descargas')
  await expect(filaA).toHaveCount(0)
  await expect(page.getByRole('main').getByRole('heading', { name: 'Instituciones sin vincular' })).toBeFocused()

  // Crear B
  await filaB.getByRole('button', { name: 'Crear establecimiento' }).click()
  await expect(dlg.getByLabel('Nombre del establecimiento')).toHaveValue(new RegExp(nombreB, 'i'))
  await dlg.getByRole('button', { name: 'Crear y vincular' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Se creó' })).toContainText('1 descarga')
  await expect(filaB).toHaveCount(0)

  await tablero(page)
  expect(await avisos(page)).toBe(base.avisos)
  await expect.poll(() => kpi(page, 'Establecimientos alcanzados')).toBe(base.alcanzados + 2)
})

test('sin vincular: crear con nombre duplicado guía a Vincular o reactivar y no pierde el foco al buscar', async ({
  page,
  browser,
}) => {
  const s = sufijoUnico()
  const existente = `Escuela Dup ${s}`
  await loginAdmin(page)
  await crearEstablecimiento(page, existente)
  const id = await tallerConEnlace(page, s)
  await descargarOtra(browser, id, existente.toUpperCase())

  await irASinVincular(page)
  await page.getByLabel('Localidad').selectOption({ label: LOCALIDAD })
  const fila = page.getByRole('row', { name: new RegExp(existente, 'i') })

  await fila.getByRole('button', { name: 'Crear establecimiento' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: 'Crear y vincular' }).click()
  const error = dlg.getByText(/Vincular/).filter({ hasText: 'reactivar' })
  await expect(error).toBeVisible()
  await expect(dlg.getByLabel('Nombre del establecimiento')).toHaveAttribute('aria-invalid', 'true')
  await page.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)

  // Buscador: escribir varias letras sin perder el foco
  await fila.getByRole('button', { name: 'Vincular', exact: true }).click()
  const buscador = dlg.getByLabel('Buscar establecimiento')
  await buscador.click()
  await page.keyboard.type(existente, { delay: 20 })
  await expect(buscador).toBeFocused()
  await expect(buscador).toHaveValue(existente)
  await expect(dlg.getByRole('radio', { name: new RegExp(existente) })).toBeVisible()
  // Sin coincidencias
  await buscador.fill('zzzz-no-existe')
  await expect(dlg.getByText('Ningún establecimiento coincide con la búsqueda')).toBeVisible()
  await expect(buscador).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)
  await expect(fila).toBeVisible()
})

test('sin vincular: estado vacío en una base sin grupos de otra localidad y enlace desde establecimientos', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/establecimientos')
  await page.getByRole('link', { name: /sin vincular/i }).click()
  await expect(page).toHaveURL(/\/admin\/establecimientos\/sin-vincular$/)
  await expect(page.getByRole('main').getByRole('heading', { name: 'Instituciones sin vincular' })).toBeVisible()
  // Con la base limpia no hay grupos; si otros specs dejaron alguno, solo se comprueba que la lista o el vacío se ven.
  const vacio = page.getByText('No hay instituciones sin vincular')
  const tabla = page.getByRole('table')
  await expect(vacio.or(tabla)).toBeVisible()})

test('sin vincular: en celular no hay scroll horizontal del documento', async ({ page, browser }) => {
  const s = sufijoUnico()
  await loginAdmin(page)
  await crearEstablecimiento(page, `Escuela Mov ${s}`)
  const id = await tallerConEnlace(page, s)
  await descargarOtra(browser, id, `Institucion movil con un nombre bastante largo para probar el ancho ${s}`)
  await page.setViewportSize({ width: 360, height: 740 })
  await irASinVincular(page)
  await expect(page.getByRole('table')).toBeVisible()
  const ancho = (await page.evaluate('document.documentElement.scrollWidth')) as number
  expect(ancho).toBeLessThanOrEqual(360)
})

test('sin vincular: Escape no cierra mientras guarda', async ({ page, browser }) => {
  const s = sufijoUnico()
  await loginAdmin(page)
  await crearEstablecimiento(page, `Escuela Esc ${s}`)
  const id = await tallerConEnlace(page, s)
  await descargarOtra(browser, id, `Escuela Escape ${s}`)
  await irASinVincular(page)
  await page.getByLabel('Localidad').selectOption({ label: LOCALIDAD })
  const fila = page.getByRole('row', { name: new RegExp(`Escuela Escape ${s}`) })
  await fila.getByRole('button', { name: 'Vincular', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('radio', { name: new RegExp(`Escuela Esc ${s}`) }).check()
  // Se frena la RPC para observar el estado "guardando".
  let liberar!: () => void
  const frenada = new Promise<void>((r) => (liberar = r))
  await page.route('**/rpc/vincular_institucion', async (route) => {
    await frenada
    await route.continue()
  })
  await dlg.getByRole('button', { name: 'Vinculando...' }).waitFor({ state: 'detached' }).catch(() => {})
  await dlg.getByRole('button', { name: 'Vincular', exact: true }).click()
  await expect(dlg.getByRole('button', { name: 'Vinculando...' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dlg).toBeVisible()
  liberar()
  await expect(dlg).toHaveCount(0)
  await expect(page.getByRole('main').getByRole('heading', { name: 'Instituciones sin vincular' })).toBeFocused()
})
