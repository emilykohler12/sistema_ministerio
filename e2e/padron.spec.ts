import { expect, test, type Page } from '@playwright/test'
import { loginAdmin } from './helpers.ts'

const sufijo = () => `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 100)}`
const cueUnico = () => `9${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 10)}`

async function crear(page: Page, localidad: string, nombre: string, cue = '') {
  await page.goto('/admin/establecimientos/nuevo')
  await page.getByLabel('Nombre del establecimiento').fill(nombre)
  await page.getByLabel('CUE (opcional)').fill(cue)
  await page.getByLabel('Localidad').selectOption({ label: localidad })
  await page.getByRole('button', { name: 'Crear establecimiento' }).click()
}

test('sin localidad se pide elegir; una localidad vacía muestra el estado vacío y la URL lleva ?localidad=', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/establecimientos')
  await expect(page.getByText('Elegí una localidad para ver sus establecimientos')).toBeVisible()
  await page.getByLabel('Localidad').selectOption({ label: 'Eldorado' })
  await expect(page).toHaveURL(/\?localidad=34$/)
  await expect(page.getByText('Esta localidad todavía no tiene establecimientos')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nuevo establecimiento' })).toHaveCount(2)
})

test('alta con CUE, listado y búsqueda sin tildes y por CUE', async ({ page }) => {
  const s = sufijo()
  const cue = cueUnico()
  const nombre = `Escuela Ñandú ${s}`
  await loginAdmin(page)
  await crear(page, 'Posadas', nombre, cue)
  await expect(page).toHaveURL(/\/admin\/establecimientos\?localidad=58$/)
  const fila = page.getByRole('row', { name: new RegExp(nombre) })
  await expect(fila).toContainText(cue)

  const buscador = page.getByLabel('Buscar por nombre o CUE')
  await buscador.fill(`nandu ${s}`)
  await expect(fila).toBeVisible()
  await buscador.fill(cue)
  await expect(fila).toBeVisible()
  await buscador.fill(`zzz-${s}`)
  await expect(page.getByText('Ningún establecimiento coincide con la búsqueda')).toBeVisible()
})

test('nombre y CUE duplicados marcan su campo, al crear y al editar', async ({ page }) => {
  const s = sufijo()
  const cue = cueUnico()
  const nombre = `Colegio Ángel ${s}`
  await loginAdmin(page)
  await crear(page, 'Oberá', nombre, cue)
  await expect(page).toHaveURL(/localidad=55$/)

  // Nombre duplicado variando mayúsculas, tildes y espacios.
  await crear(page, 'Oberá', `  COLEGIO ANGEL ${s} `)
  await expect(page.getByText(/Ya existe un establecimiento con ese nombre/)).toBeVisible()
  await expect(page).toHaveURL(/\/nuevo/)

  // CUE duplicado.
  await crear(page, 'Oberá', `Otro ${s}`, cue)
  await expect(page.getByText('Ya existe un establecimiento con ese CUE')).toBeVisible()

  // CUE inválido se rechaza en el formulario.
  await page.getByLabel('CUE (opcional)').fill('12a')
  await page.getByRole('button', { name: 'Crear establecimiento' }).click()
  await expect(page.getByText('El CUE solo puede tener dígitos')).toBeVisible()

  // Al editar: otro establecimiento intenta tomar el nombre existente y el CUE existente.
  const otro = `Tercero ${s}`
  await crear(page, 'Oberá', otro)
  await page.getByRole('row', { name: new RegExp(otro) }).getByRole('link', { name: 'Editar' }).click()
  await page.getByLabel('Nombre del establecimiento').fill(nombre.toLowerCase())
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText(/Ya existe un establecimiento con ese nombre/)).toBeVisible()
  await page.getByLabel('Nombre del establecimiento').fill(otro)
  await page.getByLabel('CUE (opcional)').fill(cue)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Ya existe un establecimiento con ese CUE')).toBeVisible()
})

test('editar cambiando la localidad vuelve al listado de la localidad nueva', async ({ page }) => {
  const nombre = `Escuela Movida ${sufijo()}`
  await loginAdmin(page)
  await crear(page, 'Posadas', nombre)
  await page.getByRole('row', { name: new RegExp(nombre) }).getByRole('link', { name: 'Editar' }).click()
  await page.getByLabel('Localidad').selectOption({ label: 'Apóstoles' })
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page).toHaveURL(/\/admin\/establecimientos\?localidad=5$/)
  await expect(page.getByRole('row', { name: new RegExp(nombre) })).toBeVisible()
})

test('baja con confirmación, "Inactivo" y reactivar', async ({ page }) => {
  const nombre = `Escuela Baja ${sufijo()}`
  await loginAdmin(page)
  await crear(page, 'Oberá', nombre)
  const fila = page.getByRole('row', { name: new RegExp(nombre) })
  await fila.getByRole('button', { name: 'Dar de baja' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dar de baja' }).click()
  await expect(fila).toContainText('Inactivo')
  await fila.getByRole('button', { name: 'Reactivar' }).click()
  await expect(fila).not.toContainText('Inactivo')
  await expect(fila.getByRole('button', { name: 'Dar de baja' })).toBeVisible()
})

test('un id inexistente o inválido en editar muestra "no encontrado"', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/establecimientos/99999999999/editar')
  await expect(page.getByText(/no encontrado/i).first()).toBeVisible()
  await page.goto('/admin/establecimientos/abc/editar')
  await expect(page.getByText(/no encontrado/i).first()).toBeVisible()
})
