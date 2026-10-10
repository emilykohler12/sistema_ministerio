import { expect, test } from '@playwright/test'
import { loginAdmin, sufijoUnico } from './helpers.ts'

async function intentarLogin(page: import('@playwright/test').Page, correo: string, password: string) {
  await page.goto('/admin/login')
  await page.getByLabel('Correo electrónico').fill(correo)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

test('credenciales inválidas muestran el error y no entran', async ({ page }) => {
  await intentarLogin(page, 'admin@dam.local', 'incorrecta')
  await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('un usuario sin marca de admin no entra al panel', async ({ page }) => {
  await intentarLogin(page, 'sin-permiso@dam.local', 'sin-permiso-dam-local')
  await expect(page.getByText('Tu cuenta no tiene permisos de administrador')).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('sin sesión, /admin/* redirige al login', async ({ page }) => {
  for (const ruta of ['/admin', '/admin/configuracion', '/admin/talleres']) {
    await page.goto(ruta)
    await expect(page).toHaveURL(/\/admin\/login/)
  }
})

test('la sesión sobrevive a una recarga, login con sesión redirige y cerrar sesión vuelve al login', async ({ page }) => {
  await loginAdmin(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.goto('/admin/login')
  await expect(page).toHaveURL(/\/admin$/)
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('editar la configuración se refleja en el portal público', async ({ page, browser }) => {
  const nombre = `Ministerio QA ${sufijoUnico()}`
  const mision = `Misión QA ${sufijoUnico()}`
  await loginAdmin(page)
  await page.goto('/admin/configuracion')
  await page.getByLabel('Nombre de la institución').fill(nombre)
  await page.getByLabel('Misión').fill(mision)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()

  // Visitante anónimo, contexto aparte.
  const ctx = await browser.newContext()
  const anon = await ctx.newPage()
  await anon.goto('/')
  await expect(anon.getByRole('heading', { level: 1, name: nombre })).toBeVisible()
  await expect(anon.getByText(mision)).toBeVisible()
  await ctx.close()

  // Nombre vacío no se guarda.
  await page.getByLabel('Nombre de la institución').fill('')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toHaveCount(0)
})
