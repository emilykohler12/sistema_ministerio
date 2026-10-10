import { expect, test, type Page } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

// PDF mínimo válido generado en el test.
const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
)

async function crearNormativa(page: Page, titulo: string, numero: string, etiqueta: string) {
  await page.goto('/admin/normativas/nueva')
  await page.getByLabel('Título').fill(titulo)
  await page.getByLabel('Descripción').fill('Normativa de prueba')
  await page.getByPlaceholder('Escribí una palabra clave y presioná Enter').fill(etiqueta)
  await page.getByPlaceholder('Escribí una palabra clave y presioná Enter').press('Enter')
  await page.getByLabel('Número').fill(numero)
  await page.getByLabel('Año').fill('2024')
  await page.locator('input[type=file]').setInputFiles({ name: 'norma.pdf', mimeType: 'application/pdf', buffer: PDF })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/normativas$/)
}

test('catálogo: taller publicado visible, borrador oculto, filtro por nivel, búsqueda y detalle', async ({ page, browser }) => {
  const s = sufijoUnico()
  const pub = `Taller Publicado ${s}`
  const bor = `Taller Borrador ${s}`
  const etiqueta = `etq${s}`
  await loginAdmin(page)
  const idPub = await crearTaller(page, { nombre: pub, categoria: `Cat Pub ${s}`, estado: 'Publicado', etiqueta })
  const idBor = await crearTaller(page, { nombre: bor, categoria: `Cat Bor ${s}`, estado: 'Borrador' })

  const ctx = await browser.newContext()
  const anon = await ctx.newPage()
  await anon.goto('/talleres')
  await expect(anon.getByRole('heading', { name: pub })).toBeVisible()
  await expect(anon.getByRole('heading', { name: bor })).toHaveCount(0)

  // Filtro por nivel: el taller es de Inicial.
  await anon.getByLabel('Nivel', { exact: true }).selectOption({ label: 'Secundario' })
  await expect(anon.getByRole('heading', { name: pub })).toHaveCount(0)
  await anon.getByLabel('Nivel', { exact: true }).selectOption({ label: 'Inicial' })
  await expect(anon.getByRole('heading', { name: pub })).toBeVisible()

  // Búsqueda por etiqueta y sin resultados.
  const buscador = anon.getByLabel('Buscar por nombre o etiqueta')
  await buscador.fill(etiqueta)
  await expect(anon.getByRole('heading', { name: pub })).toBeVisible()
  await buscador.fill(`zzz${s}`)
  await expect(anon.getByText('No encontramos talleres')).toBeVisible()
  await buscador.fill(etiqueta)

  // Detalle del publicado.
  await anon.getByRole('link', { name: 'Ver' }).first().click()
  await expect(anon).toHaveURL(new RegExp(`/talleres/${idPub}$`))
  await expect(anon.getByRole('heading', { level: 1, name: pub })).toBeVisible()

  // El borrador por URL directa no se ve.
  await anon.goto(`/talleres/${idBor}`)
  await expect(anon.getByRole('heading', { level: 1, name: bor })).toHaveCount(0)
  await ctx.close()
})

test('normativas públicas: listado, búsqueda y enlace al PDF', async ({ page, browser }) => {
  const s = sufijoUnico()
  const titulo = `Resolución QA ${s}`
  const numero = `N-${s}/24`
  await loginAdmin(page)
  await crearNormativa(page, titulo, numero, `norma${s}`)

  const ctx = await browser.newContext()
  const anon = await ctx.newPage()
  await anon.goto('/normativas')
  const buscador = anon.getByLabel('Buscar por título, número o etiqueta')
  await buscador.fill(numero)
  await expect(anon.getByText(titulo)).toBeVisible()
  await buscador.fill(`resolucion qa ${s}`)
  await expect(anon.getByText(titulo)).toBeVisible()
  await expect(anon.getByRole('link', { name: /descargar|ver|pdf/i }).first()).toHaveAttribute('href', /\.pdf$/)
  await buscador.fill(`zzz${s}`)
  await expect(anon.getByText('No encontramos normativas')).toBeVisible()
  await ctx.close()
})

test('home y contacto cargan', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('/contacto')
  await expect(page.getByRole('heading', { level: 1, name: 'Contacto' })).toBeVisible()
})
