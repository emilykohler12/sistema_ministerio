import { expect, test } from '@playwright/test'
import { loginAdmin, sufijoUnico } from './helpers.ts'

const MIN = 60_000

test('inactividad: aviso a los 28 min, "Seguir conectado" reinicia el plazo y a los 30 min sin responder cierra', async ({ page }) => {
  await page.clock.install()
  await loginAdmin(page)
  await page.goto('/admin/normativas')
  await expect(page.getByRole('heading', { name: /Normativas/ }).first()).toBeVisible()

  await page.clock.fastForward(28 * MIN + 2000)
  const aviso = page.getByRole('alertdialog', { name: 'Tu sesión está por cerrarse' })
  await expect(aviso).toBeVisible()
  await expect(aviso.getByRole('button', { name: 'Seguir conectado' })).toBeFocused()

  await aviso.getByRole('button', { name: 'Seguir conectado' }).click()
  await expect(aviso).toBeHidden()

  // El plazo se reinició: 20 min después sigue la sesión sin aviso.
  await page.clock.fastForward(20 * MIN)
  await expect(aviso).toBeHidden()
  await expect(page).toHaveURL(/\/admin\/normativas$/)

  // Ahora sin responder: aviso y cierre.
  await page.clock.fastForward(8 * MIN + 2000)
  await expect(aviso).toBeVisible()
  await page.clock.fastForward(2 * MIN + 2000)
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('alert').filter({ hasText: 'Tu sesión se cerró por inactividad' })).toBeVisible()

  // Al volver a entrar regresa a la pantalla donde estaba.
  await page.getByLabel('Correo electrónico').fill('admin@dam.local')
  await page.getByLabel('Contraseña', { exact: true }).fill('admin-dam-local')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/admin\/normativas$/)
})

test('inactividad: el aviso sobre un diálogo abierto se cierra con Escape sin cerrar el de abajo', async ({ page }) => {
  const s = sufijoUnico()
  await page.clock.install()
  await loginAdmin(page)
  await page.goto('/admin/talleres/1/nueva-categoria')
  await page.getByLabel('Nombre de la categoría').fill(`Cat Inact ${s}`)
  await page.getByRole('button', { name: 'Crear categoría' }).click()
  await page.getByRole('link', { name: `Cat Inact ${s}` }).click()
  await page.getByRole('link', { name: '+ Nuevo taller' }).first().click()
  await page.getByLabel('Nombre', { exact: true }).fill(`Taller Inact ${s}`)
  await page.getByLabel('Descripción').fill('x')
  await page.getByRole('group', { name: 'Destinado a' }).getByRole('button', { name: 'Docentes' }).click()
  await page.getByRole('button', { name: 'Crear taller' }).click()
  await expect(page).toHaveURL(/\/recursos$/)

  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  const dlg = page.getByRole('dialog', { name: /enlace/i })
  await dlg.getByLabel('Nombre').fill(`Video ${s}`)

  await page.clock.fastForward(28 * MIN + 2000)
  const aviso = page.getByRole('alertdialog', { name: 'Tu sesión está por cerrarse' })
  await expect(aviso).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(aviso).toBeHidden()
  await expect(dlg).toBeVisible()
  await expect(dlg.getByLabel('Nombre')).toHaveValue(`Video ${s}`)
})

test('inactividad: al volver a una pestaña oculta pasados los 30 min cierra la sesión', async ({ page }) => {
  await page.clock.install()
  await loginAdmin(page)
  // Se simula el tiempo con el reloj parado de la pestaña: salta la hora sin correr los intervalos.
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.clock.setSystemTime(new Date(Date.now() + 31 * MIN))
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByText('Tu sesión se cerró por inactividad')).toBeVisible()
})

test('inactividad: el portal público no muestra aviso ni cierra nada', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.clock.fastForward(31 * MIN)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})

test('inactividad: a 320 px el aviso no genera scroll horizontal', async ({ page }) => {
  await page.clock.install()
  await loginAdmin(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await page.clock.fastForward(28 * MIN + 2000)
  const aviso = page.getByRole('alertdialog', { name: 'Tu sesión está por cerrarse' })
  await expect(aviso).toBeVisible()
  const ancho = (await page.evaluate('document.documentElement.scrollWidth')) as number
  const visible = (await page.evaluate('document.documentElement.clientWidth')) as number
  expect(ancho).toBeLessThanOrEqual(visible)
  const caja = await aviso.boundingBox()
  expect(caja!.x).toBeGreaterThanOrEqual(0)
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(320)
})
