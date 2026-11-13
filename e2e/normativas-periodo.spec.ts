import { expect, test } from '@playwright/test'
import { loginAdmin, sufijoUnico } from './helpers.ts'

const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
)

test('normativas por período: «En el período» y «Total histórico», una vez por visita y rango pasado', async ({ page, browser }) => {
  const s = sufijoUnico()
  const titulo = `Norma Periodo ${s}`
  await loginAdmin(page)

  await page.goto('/admin/normativas/nueva')
  await page.getByLabel('Título').fill(titulo)
  await page.getByLabel('Descripción').fill('Normativa del período')
  await page.getByLabel('Número').fill(`NP-${s}`)
  await page.getByLabel('Año').fill('2024')
  await page.locator('input[type=file]').setInputFiles({ name: 'norma.pdf', mimeType: 'application/pdf', buffer: PDF })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/normativas$/)

  const seccion = page.getByRole('region', { name: 'Normativas' })
  const celdas = () => seccion.getByRole('row', { name: new RegExp(titulo) }).getByRole('cell')
  const abrir = async (url: string) => {
    await page.goto(url)
    await expect(page.getByRole('region', { name: 'Resumen' })).not.toHaveAttribute('aria-busy', 'true')
    await expect(celdas().first()).toBeVisible()
  }

  await abrir('/admin')
  await expect(seccion.getByRole('columnheader').nth(-2)).toHaveText('En el período')
  await expect(seccion.getByRole('columnheader').last()).toHaveText('Total histórico')
  await expect(celdas().nth(-2)).toHaveText('0')
  await expect(celdas().last()).toHaveText('0')
  await expect(seccion.getByText(/anteriores a que se registrara el día no entran en «En el período»/)).toBeVisible()

  // Anónimo: dos clics en la misma visita cuentan una sola vez.
  const anon = await (await browser.newContext()).newPage()
  await anon.goto('/normativas')
  const enlace = anon.getByRole('link', { name: `Descargar ${titulo}` })
  await expect(enlace).toBeVisible()
  const primera = anon.waitForResponse((r) => r.url().includes('/rpc/contar_descarga_normativa'))
  await Promise.all([anon.waitForEvent('popup').catch(() => null), enlace.click()])
  expect((await primera).status()).toBeLessThan(300)
  await Promise.all([anon.waitForEvent('popup').catch(() => null), enlace.click()])
  await anon.context().close()

  await abrir('/admin')
  await expect(celdas().nth(-2)).toHaveText('1')
  await expect(celdas().last()).toHaveText('1')

  // Período pasado: el período vuelve a 0, el histórico no cambia.
  await abrir('/admin?periodo=rango&desde=2020-01-01&hasta=2020-01-31')
  await expect(celdas().nth(-2)).toHaveText('0')
  await expect(celdas().last()).toHaveText('1')
})
