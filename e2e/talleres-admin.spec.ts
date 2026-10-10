import { expect, test } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

test('taller: alta con sugerencias de etiqueta, estados, edición y DA002', async ({ page, browser }) => {
  const s = sufijoUnico()
  const categoria = `Cat Taller ${s}`
  const etq = `Redes${s}`
  await loginAdmin(page)
  // Primer taller deja la etiqueta creada para que el segundo la vea sugerida.
  await crearTaller(page, { nombre: `Base ${s}`, categoria: `Base ${s}`, estado: 'Borrador', etiqueta: etq })

  await page.goto('/admin/talleres/1/nueva-categoria')
  await page.getByLabel('Nombre de la categoría').fill(categoria)
  await page.getByRole('button', { name: 'Crear categoría' }).click()
  await page.getByRole('link', { name: categoria }).click()
  await page.getByRole('link', { name: '+ Nuevo taller' }).first().click()

  // Validación: vacío no guarda.
  await page.getByRole('button', { name: 'Crear taller' }).click()
  await expect(page).toHaveURL(/\/nuevo$/)

  const nombre = `Cuidados ${s}`
  await page.getByLabel('Nombre', { exact: true }).fill(nombre)
  await page.getByLabel('Descripción').fill('Descripción del taller')
  await page.getByRole('group', { name: 'Destinado a' }).getByRole('button', { name: 'Docentes' }).click()
  const campo = page.locator('input[list]')
  await campo.fill(etq.slice(0, 6).toLowerCase())
  await page.getByRole('button', { name: etq, exact: true }).click()
  await campo.fill(`Nueva${s}`)
  await campo.press('Enter')
  await page.getByRole('button', { name: 'Crear taller' }).click()
  await expect(page).toHaveURL(/\/\d+\/recursos$/)
  await expect(page.getByRole('heading', { name: 'Recursos' })).toBeVisible()

  // Lista: estado Borrador, no visible en el portal.
  await page.getByRole('link', { name: categoria }).click()
  const fila = page.getByRole('row', { name: new RegExp(nombre) })
  await expect(fila.getByText('Borrador')).toBeVisible()
  await expect(fila.getByText('Docentes')).toBeVisible()

  // Edición: publicar.
  await fila.getByRole('link', { name: 'Editar' }).click()
  await page.getByLabel('Estado').selectOption({ label: 'Publicado' })
  await page.getByLabel('Nombre', { exact: true }).fill(`${nombre} v2`)
  await page.getByRole('button', { name: /Guardar/ }).click()
  const fila2 = page.getByRole('row', { name: new RegExp(`${nombre} v2`) })
  await expect(fila2.getByText('Publicado')).toBeVisible()

  const anon = await (await browser.newContext()).newPage()
  await anon.goto('/talleres')
  await expect(anon.getByRole('heading', { name: `${nombre} v2` })).toBeVisible()

  // Baja del taller y reactivación a Borrador.
  await fila2.getByRole('button', { name: 'Dar de baja' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dar de baja' }).click()
  await expect(fila2.getByText('Inactivo')).toBeVisible()
  await anon.reload()
  await expect(anon.getByRole('heading', { name: `${nombre} v2` })).toHaveCount(0)

  // Con la categoría inactiva, reactivar el taller da DA002.
  await page.getByRole('link', { name: 'Talleres', exact: true }).first().click()
  await page.goto('/admin/talleres/1')
  const tarjeta = page.getByRole('link', { name: categoria, exact: true }).locator('..')
  await tarjeta.getByRole('button', { name: 'Dar de baja' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dar de baja' }).click()
  await expect(tarjeta.getByText('Inactiva')).toBeVisible()
  await tarjeta.getByRole('link', { name: categoria }).click()
  await page.getByRole('row', { name: new RegExp(nombre) }).getByRole('button', { name: 'Reactivar' }).click()
  await expect(page.getByText('La categoría está dada de baja: reactivala primero')).toBeVisible()
})

test('breadcrumb: categoría y taller con el mismo nombre no repiten key en React', async ({ page }) => {
  const s = sufijoUnico()
  const nombre = `Igual ${s}`
  const errores: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errores.push(m.text())
  })
  await loginAdmin(page)
  await crearTaller(page, { nombre, categoria: nombre, estado: 'Borrador' })
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(nombre)).toHaveCount(2)
  expect(errores.filter((e) => e.includes('same key'))).toEqual([])
})
