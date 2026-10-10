import { expect, test } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

const pdf = (nombre: string, relleno = '') => ({
  name: nombre,
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    `%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n${relleno}\ntrailer<</Root 1 0 R>>\n%%EOF`,
  ),
})

test('recursos: subir PDF, enlace de YouTube, reordenar, renombrar, reemplazar, portal y eliminar', async ({ page, browser }) => {
  const s = sufijoUnico()
  const taller = `Taller Recursos ${s}`
  const guia = `guia${s}`
  await loginAdmin(page)
  const id = await crearTaller(page, { nombre: taller, categoria: `Cat Recursos ${s}`, estado: 'Publicado' })
  const urlRecursos = page.url()
  await expect(page.getByText('Todavía no hay recursos en este taller')).toBeVisible()

  // Archivo con tipo no admitido: error con el motivo, sin recurso.
  await page.locator('input[type=file]').first().setInputFiles({ name: `virus${s}.exe`, mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') })
  await expect(page.getByRole('alert').getByText(`virus${s}.exe`)).toBeVisible()
  await expect(page.getByText('Todavía no hay recursos en este taller')).toBeVisible()

  // PDF.
  await page.locator('input[type=file]').first().setInputFiles(pdf(`${guia}.pdf`))
  const items = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Subir / }) })
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText(guia)
  await expect(items.first()).toContainText('PDF')

  // Enlace de YouTube.
  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Nombre').fill(`Video ${s}`)
  await dlg.getByLabel('URL').fill('http://insegura.com')
  await dlg.getByRole('button', { name: 'Agregar' }).click()
  await expect(dlg.getByText('Ingresá una URL que empiece con https://')).toBeVisible()
  await dlg.getByLabel('URL').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await dlg.getByRole('button', { name: 'Agregar' }).click()
  await expect(items).toHaveCount(2)
  await expect(items.nth(1)).toContainText(`Video ${s}`)

  // Reordenar: el video sube y queda primero (persiste al recargar).
  await page.getByRole('button', { name: `Subir Video ${s}` }).click()
  await expect(items.first()).toContainText(`Video ${s}`)
  await page.reload()
  await expect(items.first()).toContainText(`Video ${s}`)

  // Renombrar el PDF.
  await page.getByRole('button', { name: `Editar ${guia}` }).click()
  await dlg.getByLabel('Nombre').fill(`${guia} v2`)
  await dlg.getByRole('button', { name: 'Guardar' }).click()
  await expect(items.nth(1)).toContainText(`${guia} v2`)

  // Reemplazar el PDF por uno de otro tamaño: conserva nombre y posición.
  const tam = await items.nth(1).textContent()
  await page.getByLabel(`Archivo nuevo para ${guia} v2`).setInputFiles(pdf('otro.pdf', 'x'.repeat(5000)))
  await expect(items.nth(1)).not.toHaveText(tam!)
  await expect(items.nth(1)).toContainText(`${guia} v2`)

  // Portal anónimo: recursos del taller publicado.
  const anon = await (await browser.newContext()).newPage()
  await anon.goto(`/talleres/${id}`)
  await expect(anon.getByRole('heading', { name: 'Recursos', exact: true })).toBeVisible()
  await expect(anon.getByText(`${guia} v2`)).toBeVisible()
  await expect(anon.locator('iframe[src^="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveCount(1)
  await expect(anon.getByText(/Tamaño total/)).toBeVisible()

  // Eliminar con confirmación.
  await page.getByRole('button', { name: `Eliminar ${guia} v2` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(items).toHaveCount(1)
  await anon.reload()
  await expect(anon.getByText(`${guia} v2`)).toHaveCount(0)
  expect(page.url()).toBe(urlRecursos)
})
