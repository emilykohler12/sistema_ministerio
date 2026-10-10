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

test('/contacto muestra los datos de la configuración con tel:/mailto: y sin texto de CABA', async ({ page, browser }) => {
  const s = sufijoUnico()
  const telefono = `376 4${s.slice(0, 6)}`
  const correo = `contacto${s}@dam.local`
  await loginAdmin(page)
  await page.goto('/admin/configuracion')
  await page.getByLabel('Teléfono').fill(telefono)
  await page.getByLabel('Correo de contacto').fill(correo)
  await page.getByLabel('Dirección').fill(`Calle QA ${s}`)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()

  const ctx = await browser.newContext()
  const anon = await ctx.newPage()
  await anon.goto('/contacto')
  const principal = anon.locator('#main-content')
  await expect(principal.getByRole('link', { name: telefono })).toHaveAttribute('href', `tel:${telefono.replace(/\s+/g, '')}`)
  await expect(principal.getByRole('link', { name: correo })).toHaveAttribute('href', `mailto:${correo}`)
  await expect(principal.getByText(`Calle QA ${s}`)).toBeVisible()
  await expect(anon.getByText(/Pizzurno|CABA/)).toHaveCount(0)

  // Editar el teléfono se refleja.
  const nuevo = `376 5${s.slice(0, 6)}`
  await page.getByLabel('Teléfono').fill(nuevo)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()
  await anon.reload()
  await expect(principal.getByRole('link', { name: nuevo })).toBeVisible()
  await ctx.close()
})
