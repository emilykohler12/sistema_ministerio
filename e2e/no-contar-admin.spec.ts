import { expect, test, type Page } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
)

async function esperarTablero(page: Page) {
  await expect(page.getByRole('region', { name: 'Resumen' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumen' })).not.toHaveAttribute('aria-busy', 'true')
}

async function kpiDescargas(page: Page) {
  const texto = await page
    .getByRole('region', { name: 'Resumen' })
    .getByText('Descargas', { exact: true })
    .locator('xpath=following-sibling::p')
    .innerText()
  return Number(texto.replace(/\./g, ''))
}

async function contadorNormativa(page: Page, titulo: string) {
  const fila = page.getByRole('region', { name: 'Normativas' }).getByRole('row', { name: new RegExp(titulo) })
  return Number((await fila.getByRole('cell').last().innerText()).replace(/\./g, ''))
}

/** Lee KPI y contador de la normativa en un /admin recién cargado. */
async function leerTablero(page: Page, titulo: string) {
  await page.goto('/admin')
  await esperarTablero(page)
  await expect(page.getByRole('region', { name: 'Normativas' }).getByRole('row', { name: new RegExp(titulo) })).toBeVisible()
  return { descargas: await kpiDescargas(page), norma: await contadorNormativa(page, titulo) }
}

/** Descarga el taller en el portal con la sesión de `p` (la que tenga) y abre la normativa; espera la respuesta de ambas RPC. */
async function descargarYAbrir(p: Page, tallerId: number, titulo: string) {
  await p.goto(`/talleres/${tallerId}`)
  await p.getByRole('button', { name: 'Descargar' }).first().click()
  const dlg = p.getByRole('dialog')
  await dlg.getByLabel('Cargo').selectOption({ label: 'Docente' })
  await dlg.getByLabel('Localidad').selectOption({ label: 'Posadas' })
  await expect(dlg.getByLabel('Institución').getByRole('option', { name: 'Otra' })).toHaveCount(1)
  await dlg.getByLabel('Institución').selectOption({ label: 'Sin institución' })
  const registro = p.waitForResponse((r) => r.url().includes('/rpc/registrar_descarga'))
  await dlg.getByRole('button', { name: 'Descargar' }).click()
  expect((await registro).status()).toBeLessThan(300)
  await expect(dlg.getByText(/Enlace/).first()).toBeVisible()

  await p.goto('/normativas')
  const enlace = p.getByRole('link', { name: `Descargar ${titulo}` })
  await expect(enlace).toBeVisible()
  const conteo = p.waitForResponse((r) => r.url().includes('/rpc/contar_descarga_normativa'))
  await Promise.all([p.waitForEvent('popup').catch(() => null), enlace.click()])
  expect((await conteo).status()).toBeLessThan(300)
}

test('no contar admin: sus descargas no suben el tablero; las anónimas sí (+1)', async ({ page, browser }) => {
  const s = sufijoUnico()
  const titulo = `Norma NoAdmin ${s}`
  await loginAdmin(page)

  const tallerId = await crearTaller(page, { nombre: `Taller NoAdmin ${s}`, categoria: `Cat NoAdmin ${s}`, estado: 'Publicado' })
  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  const dlgEnlace = page.getByRole('dialog')
  await dlgEnlace.getByLabel('Nombre').fill(`Enlace ${s}`)
  await dlgEnlace.getByLabel('URL').fill('https://example.com/material')
  await dlgEnlace.getByRole('button', { name: 'Agregar' }).click()
  await expect(page.getByText(`Enlace ${s}`, { exact: true })).toBeVisible()

  await page.goto('/admin/normativas/nueva')
  await page.getByLabel('Título').fill(titulo)
  await page.getByLabel('Descripción').fill('Normativa de la prueba')
  await page.getByLabel('Número').fill(`NA-${s}`)
  await page.getByLabel('Año').fill('2024')
  await page.locator('input[type=file]').setInputFiles({ name: 'norma.pdf', mimeType: 'application/pdf', buffer: PDF })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/normativas$/)

  const base = await leerTablero(page, titulo)

  // 1. Con la sesión de admin: descarga y apertura no cuentan.
  await descargarYAbrir(page, tallerId, titulo)
  const trasAdmin = await leerTablero(page, titulo)
  expect(trasAdmin).toEqual(base)

  // 2. Anónimo: suben en 1 cada uno.
  const anon = await (await browser.newContext()).newPage()
  await descargarYAbrir(anon, tallerId, titulo)
  await anon.context().close()
  const trasAnon = await leerTablero(page, titulo)
  expect(trasAnon).toEqual({ descargas: base.descargas + 1, norma: base.norma + 1 })
})
