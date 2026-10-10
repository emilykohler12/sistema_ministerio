import { expect, test } from '@playwright/test'
import { loginAdmin } from './helpers.ts'

test('la home carga', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('el administrador inicia sesión y llega al dashboard', async ({ page }) => {
  await loginAdmin(page)
})
