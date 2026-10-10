import { expect, test, type Page } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

const tarjeta = (page: Page, nombre: string) => page.getByRole('link', { name: nombre, exact: true }).locator('..')

async function crearCategoria(page: Page, nivelId: number, nombre: string) {
  await page.goto(`/admin/talleres/${nivelId}/nueva-categoria`)
  await page.getByLabel('Nombre de la categoría').fill(nombre)
  await page.getByRole('button', { name: 'Crear categoría' }).click()
}

test('categorías: alta, duplicado normalizado, edición, baja y reactivación', async ({ page }) => {
  const s = sufijoUnico()
  const nombre = `Salud mental ${s}`
  await loginAdmin(page)

  await page.goto('/admin/talleres')
  await expect(page.getByRole('heading', { name: 'Talleres' })).toBeVisible()
  for (const n of ['Inicial', 'Primario', 'Secundario']) await expect(page.getByText(n, { exact: true }).first()).toBeVisible()

  await crearCategoria(page, 4, nombre)
  await expect(page.getByRole('link', { name: nombre, exact: true })).toBeVisible()

  // Duplicado: mayúsculas, tildes y espacios de más en el mismo nivel.
  await crearCategoria(page, 4, `  SALUD MÉNTAL ${s} `)
  await expect(page.getByText('Ya existe una categoría con ese nombre en este nivel')).toBeVisible()

  // En otro nivel, el mismo nombre pasa.
  await crearCategoria(page, 3, nombre)
  await expect(page.getByRole('link', { name: nombre, exact: true })).toBeVisible()

  // Edición.
  await page.goto('/admin/talleres/4')
  await tarjeta(page, nombre).getByRole('link', { name: 'Editar' }).click()
  await expect(page.getByRole('heading', { name: 'Editar categoría' })).toBeVisible()
  await page.getByLabel('Nombre de la categoría').fill(`${nombre} editada`)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  const editada = `${nombre} editada`
  await expect(page.getByRole('link', { name: editada, exact: true })).toBeVisible()

  // Baja y reactivación.
  await tarjeta(page, editada).getByRole('button', { name: 'Dar de baja' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dar de baja' }).click()
  await expect(tarjeta(page, editada).getByText('Inactiva')).toBeVisible()
  await tarjeta(page, editada).getByRole('button', { name: 'Reactivar' }).click()
  await expect(tarjeta(page, editada).getByText('Inactiva')).toHaveCount(0)
  await expect(tarjeta(page, editada).getByRole('button', { name: 'Dar de baja' })).toBeVisible()
})

test('categorías: la baja con talleres no inactivos muestra la cantidad (DA001)', async ({ page }) => {
  const s = sufijoUnico()
  const categoria = `Cat DA001 ${s}`
  await loginAdmin(page)
  await crearTaller(page, { nombre: `Taller DA001 ${s}`, categoria, estado: 'Borrador' })

  await page.goto('/admin/talleres/1')
  await tarjeta(page, categoria).getByRole('button', { name: 'Dar de baja' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dar de baja' }).click()
  await expect(page.getByText('No se puede dar de baja: tiene 1 taller en borrador o publicado')).toBeVisible()
  await expect(tarjeta(page, categoria).getByText('Inactiva')).toHaveCount(0)
})

test('niveles: un nivel o categoría inexistente muestra "no encontrado"', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/talleres/999')
  await expect(page.getByText('Nivel no encontrado')).toBeVisible()
  await page.goto('/admin/talleres/1/999999')
  await expect(page.getByText('Categoría no encontrada')).toBeVisible()
})
