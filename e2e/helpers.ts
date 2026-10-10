import { expect, type Page } from '@playwright/test'

// Usuario sembrado por `npm run db:reset` (scripts/seed-usuarios.mjs). Solo existe en el Supabase local.
const ADMIN = { correo: 'admin@dam.local', password: 'admin-dam-local' }

/** Inicia sesión como administrador y espera el dashboard. */
export async function loginAdmin(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Correo electrónico').fill(ADMIN.correo)
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}
