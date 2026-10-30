import { expect, test, type Page } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico, vaciarIntentos } from './helpers.ts'

// En local todas las llamadas llegan con la IP del gateway de Docker: un solo "cliente" para API y navegador.
const TOPE = 30

async function kpiDescargas(page: Page) {
  await page.goto('/admin')
  const resumen = page.getByRole('region', { name: 'Resumen' })
  await expect(resumen).toBeVisible()
  await expect(resumen).not.toHaveAttribute('aria-busy', 'true')
  const texto = await resumen.getByText('Descargas', { exact: true }).locator('xpath=following-sibling::p').innerText()
  return Number(texto.replace(/\./g, ''))
}

test.afterAll(async () => {
  // El globalSetup corre una vez por suite: no dejar el tope agotado para los specs siguientes.
  await vaciarIntentos()
})

test('tope por IP: pasadas 30 descargas el modal sigue andando pero no cuenta; encabezados falsos tampoco', async ({ page, browser, request }) => {
  const s = sufijoUnico()
  const { url, clave } = await vaciarIntentos()
  await loginAdmin(page)
  const tallerId = await crearTaller(page, { nombre: `Taller Tope ${s}`, categoria: `Cat Tope ${s}`, estado: 'Publicado' })
  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  const dlgEnlace = page.getByRole('dialog')
  await dlgEnlace.getByLabel('Nombre').fill(`Enlace Tope ${s}`)
  await dlgEnlace.getByLabel('URL').fill('https://example.com/material')
  await dlgEnlace.getByRole('button', { name: 'Agregar' }).click()
  await expect(page.getByText(`Enlace Tope ${s}`, { exact: true })).toBeVisible()

  const base = await kpiDescargas(page)

  // Visitante: clave publicable capturada de un pedido real del portal.
  const anon = await (await browser.newContext()).newPage()
  let apikey = ''
  anon.on('request', (r) => {
    const k = r.headers()['apikey']
    if (k && r.url().includes('/rest/v1/')) apikey = k
  })
  await anon.goto(`/talleres/${tallerId}`)
  await expect(anon.getByRole('button', { name: 'Descargar' }).first()).toBeVisible()
  expect(apikey).not.toBe('')

  const cuerpo = {
    p_taller_id: tallerId,
    p_cargo: 'Docente',
    p_localidad_id: 58,
    p_institucion_tipo: 'SIN_INSTITUCION',
  }
  const llamar = (extra: Record<string, string> = {}) =>
    request.post(`${url}/rest/v1/rpc/registrar_descarga`, {
      headers: { apikey, 'Content-Type': 'application/json', ...extra },
      data: cuerpo,
    })

  for (let i = 0; i < TOPE; i++) expect((await llamar()).status()).toBe(204)

  // En la base: 30 intentos, con hashes sha256 (32 bytes = 64 hex) y no la IP.
  const intentos = await request.get(`${url}/rest/v1/intento_descarga?select=ip_hash`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
  })
  const filas = (await intentos.json()) as { ip_hash: string }[]
  expect(filas).toHaveLength(TOPE)
  for (const f of filas) expect(f.ip_hash).toMatch(/^\\x[0-9a-f]{64}$/)

  expect(await kpiDescargas(page)).toBe(base + TOPE)

  // Con el tope alcanzado: el modal muestra los enlaces, sin error visible, y no suma.
  await anon.goto(`/talleres/${tallerId}`)
  await anon.getByRole('button', { name: 'Descargar' }).first().click()
  const dlg = anon.getByRole('dialog')
  await dlg.getByLabel('Cargo').selectOption({ label: 'Docente' })
  await dlg.getByLabel('Localidad').selectOption({ label: 'Posadas' })
  await expect(dlg.getByLabel('Institución').getByRole('option', { name: 'Otra' })).toHaveCount(1)
  await dlg.getByLabel('Institución').selectOption({ label: 'Sin institución' })
  const registro = anon.waitForResponse((r) => r.url().includes('/rpc/registrar_descarga'))
  await dlg.getByRole('button', { name: 'Descargar' }).click()
  expect((await registro).status()).toBeLessThan(300)
  await expect(dlg.getByRole('link', { name: `Enlace Tope ${s}` })).toBeVisible()
  await expect(dlg.getByRole('alert')).toHaveCount(0)
  await expect(dlg.getByText(/no está disponible|error|no se pudo/i)).toHaveCount(0)

  // Encabezados falsos: ni suman ni abren un cupo nuevo.
  expect((await llamar({ 'X-Forwarded-For': '203.0.113.9', 'X-Real-IP': '203.0.113.10' })).status()).toBe(204)
  expect((await llamar({ 'X-Forwarded-For': '198.51.100.7' })).status()).toBe(204)

  expect(await kpiDescargas(page)).toBe(base + TOPE)
  const tras = await request.get(`${url}/rest/v1/intento_descarga?select=id`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
  })
  expect(await tras.json()).toHaveLength(TOPE)

  await anon.context().close()
})
