import { expect, type Page } from '@playwright/test'
import { supabaseLocal } from '../scripts/lib/supabaseLocal.ts'

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

/** Vacía `intento_descarga` (tope de frecuencia, 0030) con la clave de servicio del Supabase local. */
export async function vaciarIntentos() {
  const { url, clave } = supabaseLocal()
  const r = await fetch(`${url}/rest/v1/intento_descarga?id=gt.0`, {
    method: 'DELETE',
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
  })
  if (!r.ok) throw new Error(`No se pudo vaciar intento_descarga (${r.status}).`)
  return { url, clave }
}

export const sufijoUnico = () => `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 100)}`

/**
 * Crea por la UI una categoría en el nivel Inicial (id 1) y un taller dentro de ella.
 * Devuelve el id del taller (sale de la URL de "Recursos", adonde navega el alta).
 */
export async function crearTaller(
  page: Page,
  datos: { nombre: string; categoria: string; estado: 'Borrador' | 'Publicado'; etiqueta?: string },
) {
  await page.goto('/admin/talleres/1/nueva-categoria')
  await page.getByLabel('Nombre de la categoría').fill(datos.categoria)
  await page.getByRole('button', { name: 'Crear categoría' }).click()
  await page.getByRole('link', { name: datos.categoria }).click()
  await page.getByRole('link', { name: '+ Nuevo taller' }).first().click()
  await page.getByLabel('Nombre', { exact: true }).fill(datos.nombre)
  await page.getByLabel('Descripción').fill(`Descripción de ${datos.nombre}`)
  await page.getByLabel('Estado').selectOption({ label: datos.estado })
  await page.getByRole('group', { name: 'Destinado a' }).getByRole('button', { name: 'Docentes' }).click()
  if (datos.etiqueta) {
    await page.getByPlaceholder('Ej: lectura, evaluación').fill(datos.etiqueta)
    await page.getByPlaceholder('Ej: lectura, evaluación').press('Enter')
  }
  await page.getByRole('button', { name: 'Crear taller' }).click()
  await expect(page).toHaveURL(/\/(\d+)\/recursos$/)
  return Number(/\/(\d+)\/recursos$/.exec(page.url())![1])
}
