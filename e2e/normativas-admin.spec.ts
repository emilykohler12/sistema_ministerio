import { expect, test, type Page } from '@playwright/test'
import { loginAdmin, sufijoUnico } from './helpers.ts'

const pdf = (relleno = '') => ({
  name: 'norma.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    `%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n${relleno}\ntrailer<</Root 1 0 R>>\n%%EOF`,
  ),
})

async function alta(page: Page, titulo: string, numero: string, anio: string, adjuntar = true) {
  await page.goto('/admin/normativas/nueva')
  await page.getByLabel('Título').fill(titulo)
  await page.getByLabel('Descripción').fill('Normativa de prueba')
  await page.getByLabel('Número').fill(numero)
  await page.getByLabel('Año').fill(anio)
  if (adjuntar) await page.locator('input[type=file]').setInputFiles(pdf())
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
}

test('normativas admin: alta, duplicado, edición con y sin PDF y baja', async ({ page }) => {
  const s = sufijoUnico()
  const titulo = `Resolución ${s}`
  const numero = `N-${s}`
  await loginAdmin(page)

  await alta(page, titulo, numero, '2023')
  await expect(page).toHaveURL(/\/admin\/normativas$/)
  const fila = page.getByRole('row', { name: new RegExp(titulo) })
  await expect(fila).toContainText(numero)
  await expect(fila).toContainText('2023')

  // Sin PDF no guarda.
  await alta(page, `Sin PDF ${s}`, `SP-${s}`, '2023', false)
  await expect(page).toHaveURL(/\/nueva$/)
  await expect(page.getByRole('row', { name: new RegExp(`Sin PDF ${s}`) })).toHaveCount(0)

  // Duplicado: mismo número (otra capitalización y espacios) y año.
  await alta(page, `Duplicada ${s}`, `  n-${s} `, '2023')
  await expect(page).toHaveURL(/\/nueva$/)
  await expect(page.getByRole('alert')).toBeVisible()
  // Mismo número en otro año sí pasa.
  await alta(page, `Otro año ${s}`, numero, '2024')
  await expect(page).toHaveURL(/\/admin\/normativas$/)

  // Edición sin archivo.
  await page.getByRole('row', { name: new RegExp(titulo) }).getByRole('link', { name: 'Editar' }).click()
  await page.getByLabel('Título').fill(`${titulo} editada`)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/normativas$/)
  await expect(page.getByRole('row', { name: new RegExp(`${titulo} editada`) })).toBeVisible()

  // Edición reemplazando el PDF.
  await page.getByRole('row', { name: new RegExp(`${titulo} editada`) }).getByRole('link', { name: 'Editar' }).click()
  await page.locator('input[type=file]').setInputFiles(pdf('reemplazo'))
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/normativas$/)
  await expect(page.getByRole('row', { name: new RegExp(`${titulo} editada`) })).toBeVisible()

  // Baja con confirmación (cancelar no borra).
  const filaEd = page.getByRole('row', { name: new RegExp(`${titulo} editada`) })
  await filaEd.getByRole('button', { name: 'Eliminar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  await expect(filaEd).toBeVisible()
  await filaEd.getByRole('button', { name: 'Eliminar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(filaEd).toHaveCount(0)
})
