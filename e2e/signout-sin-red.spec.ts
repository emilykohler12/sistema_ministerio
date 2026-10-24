import { expect, test, type Page } from '@playwright/test'
import { loginAdmin } from './helpers.ts'

const CLAVE_SESION = 'dam-auth-sesion'
const MIN = 60_000

/** Marca el documento para detectar luego si hubo una carga completa. */
const marcar = (page: Page) => page.evaluate('window.__marca = 1')
const hayMarca = async (page: Page) => (await page.evaluate('window.__marca === 1')) as boolean

/** Deja el access token vencido en la sesión guardada (el cliente la relee del storage). */
const vencerToken = (page: Page) =>
  page.evaluate((clave) => {
    const s = JSON.parse(sessionStorage.getItem(clave)!)
    s.expires_at = 1
    s.access_token = 'vencido.vencido.vencido'
    sessionStorage.setItem(clave, JSON.stringify(s))
  }, CLAVE_SESION)

test('cerrar sesión con red: va al login sin recargar la página', async ({ page }) => {
  await loginAdmin(page)
  await marcar(page)
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
  expect(await hayMarca(page)).toBe(true)
})

test('token vigente y sin red: cerrar sesión llega al login sin recarga', async ({ page, context }) => {
  await loginAdmin(page)
  await marcar(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
  expect(await hayMarca(page)).toBe(true)
  await context.setOffline(false)
})

test('token vigente y sin red: el cierre por inactividad llega al login con el aviso', async ({ page, context }) => {
  await page.clock.install()
  await loginAdmin(page)
  await marcar(page)
  await context.setOffline(true)
  await page.clock.fastForward(28 * MIN + 2000)
  await expect(page.getByRole('alertdialog', { name: 'Tu sesión está por cerrarse' })).toBeVisible()
  await page.clock.fastForward(2 * MIN + 2000)
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('alert').filter({ hasText: 'Tu sesión se cerró por inactividad' })).toBeVisible()
  expect(await hayMarca(page)).toBe(true)
  await context.setOffline(false)
})

test('token vencido y sin red: se descarta la sesión y no revive al volver la red', async ({ page, context }) => {
  await loginAdmin(page)
  await vencerToken(page)
  await context.setOffline(true)
  const t0 = Date.now()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  // Sin red la recarga a /admin/login falla (página de error del navegador): el panel desaparece, pero
  // el documento deja de ser el de la app. Se mide cuánto tarda y no se toca el storage de ese documento.
  await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/chrome-error|\/admin\/login/)
  console.log(`QA: panel fuera en ${Date.now() - t0} ms, url=${page.url()}`)

  await context.setOffline(false)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
})
