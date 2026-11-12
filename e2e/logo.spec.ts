import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { supabaseLocal } from '../scripts/lib/supabaseLocal.ts'
import { loginAdmin } from './helpers.ts'

// PNG válido de verdad (RGB, 32x32, color sólido), armado con zlib y CRC32.
function crc32(buf: Buffer) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function trozo(tipo: string, datos: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([len, cuerpo, crc])
}
function crearPng(lado = 32, rgb: [number, number, number] = [200, 30, 30]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(lado, 0)
  ihdr.writeUInt32BE(lado, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const fila = Buffer.concat([Buffer.from([0]), Buffer.from(Array(lado).fill(rgb).flat())])
  const crudo = Buffer.concat(Array(lado).fill(fila))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo)),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

// JPG real: lo codifica el propio Chromium con una captura.
async function crearJpg(page: Page) {
  await page.setContent('<body style="margin:0;background:#2a6fdb"><div style="width:32px;height:32px"></div></body>')
  return page.screenshot({ type: 'jpeg', clip: { x: 0, y: 0, width: 32, height: 32 } })
}

const IMG_LOGO = 'img[src*="/storage/v1/object/public/logo/"]'

async function objetosDelBucket() {
  const { url, clave } = supabaseLocal()
  const r = await fetch(`${url}/storage/v1/object/list/logo`, {
    method: 'POST',
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 100 }),
  })
  expect(r.ok).toBe(true)
  return ((await r.json()) as { name: string }[]).map((o) => o.name)
}

// Red de seguridad: deja la base sin logo aunque un test falle a medias (solo Supabase local).
async function limpiarLogo() {
  const { url, clave } = supabaseLocal()
  const h = { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' }
  await fetch(`${url}/rest/v1/configuracion?id=eq.1`, { method: 'PATCH', headers: h, body: JSON.stringify({ logo_ruta: null }) })
  const nombres = await objetosDelBucket()
  if (nombres.length) {
    await fetch(`${url}/storage/v1/object/logo`, { method: 'DELETE', headers: h, body: JSON.stringify({ prefixes: nombres }) })
  }
}

const hrefFavicon = (page: Page) => page.locator('link[rel="icon"]').getAttribute('href')

async function abrirConfiguracion(page: Page) {
  await page.goto('/admin/configuracion')
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible()
}

test.beforeEach(limpiarLogo)
test.afterEach(limpiarLogo)

test('sin logo: iniciales en portal y panel, favicon por defecto', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('header span[aria-hidden="true"]').filter({ hasText: /^[A-ZÁÉÍÓÚÑ]{1,3}$/ }).first()).toBeVisible()
  await expect(page.locator(IMG_LOGO)).toHaveCount(0)
  await expect.poll(() => hrefFavicon(page)).toMatch(/\/favicon\.svg$/)

  await loginAdmin(page)
  await expect(page.locator(IMG_LOGO)).toHaveCount(0)
  await expect.poll(() => hrefFavicon(page)).toMatch(/\/favicon\.svg$/)
  await abrirConfiguracion(page)
  await expect(page.getByRole('button', { name: 'Quitar logo' })).toHaveCount(0)
})

test('subir PNG, cambiar por JPG y quitar: vista previa, portal, panel, favicon, foco y bucket', async ({ page }) => {
  await loginAdmin(page)
  await abrirConfiguracion(page)

  const texto = `Misión sin guardar ${Date.now()}`
  await page.getByLabel('Misión').fill(texto)

  await page.getByLabel('Archivo del logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: crearPng() })
  await expect(page.getByText('Logo actualizado')).toBeVisible()

  // Vista previa y barra del panel (dos imágenes del bucket en la pantalla de configuración).
  const imgs = page.locator(IMG_LOGO)
  await expect(imgs).toHaveCount(2)
  for (const img of await imgs.all()) {
    await expect.poll(() => img.evaluate((e) => (e as unknown as { naturalWidth: number }).naturalWidth)).toBeGreaterThan(0)
  }
  await expect(page.getByRole('img', { name: 'Logo actual de la institución' })).toBeVisible()
  await expect(page.getByLabel('Misión')).toHaveValue(texto)
  await expect(page.getByRole('button', { name: 'Cambiar logo' })).toBeFocused()

  const [png] = await objetosDelBucket()
  expect(png).toMatch(/^[0-9a-f-]{36}\.png$/)
  await expect.poll(() => hrefFavicon(page)).toContain(`/logo/${png}`)

  // Portal (navegación interna para no perder la sesión): encabezado y pie.
  await page.goto('/')
  await expect(page.locator(`header ${IMG_LOGO}`)).toBeVisible()
  await expect(page.locator(`footer ${IMG_LOGO}`)).toBeVisible()
  await expect
    .poll(() =>
      page.locator(`header ${IMG_LOGO}`).evaluate((e) => (e as unknown as { naturalWidth: number }).naturalWidth),
    )
    .toBeGreaterThan(0)
  await expect.poll(() => hrefFavicon(page)).toContain(`/logo/${png}`)

  // Cambiar por JPG.
  const aux = await page.context().newPage()
  const jpg = await crearJpg(aux)
  await aux.close()
  await abrirConfiguracion(page)
  await page.getByLabel('Archivo del logo').setInputFiles({ name: 'logo.JPEG', mimeType: 'image/jpeg', buffer: jpg })
  await expect(page.getByText('Logo actualizado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cambiar logo' })).toBeFocused()
  await expect.poll(async () => (await objetosDelBucket()).length).toBe(1)
  const [nuevo] = await objetosDelBucket()
  expect(nuevo).toMatch(/^[0-9a-f-]{36}\.jpg$/)
  expect(nuevo).not.toBe(png)
  await expect.poll(() => hrefFavicon(page)).toContain(`/logo/${nuevo}`)
  await expect(page.locator(IMG_LOGO).first()).toHaveAttribute('src', new RegExp(nuevo))

  // Quitar.
  await page.getByRole('button', { name: 'Quitar logo' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar logo' }).click()
  await expect(page.getByText('Logo quitado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cambiar logo' })).toBeFocused()
  await expect(page.locator(IMG_LOGO)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Quitar logo' })).toHaveCount(0)
  await expect.poll(() => hrefFavicon(page)).toMatch(/\/favicon\.svg$/)
  expect(await objetosDelBucket()).toEqual([])
})

test('el favicon sigue al logo tras un login nuevo (queryClient.clear)', async ({ page }) => {
  await loginAdmin(page)
  await abrirConfiguracion(page)
  await page.getByLabel('Archivo del logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: crearPng() })
  await expect(page.getByText('Logo actualizado')).toBeVisible()
  const [png] = await objetosDelBucket()

  // El login vuelve a la pantalla desde la que se cerró sesión; loginAdmin espera el dashboard.
  await page.getByRole('link', { name: 'Dashboard' }).first().click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.getByRole('button', { name: /Cerrar sesión/ }).click()
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect.poll(() => hrefFavicon(page)).toContain(`/logo/${png}`)

  await loginAdmin(page)
  await expect.poll(() => hrefFavicon(page)).toContain(`/logo/${png}`)
  await abrirConfiguracion(page)
  await page.getByRole('button', { name: 'Quitar logo' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar logo' }).click()
  await expect(page.getByText('Logo quitado')).toBeVisible()
  await expect.poll(() => hrefFavicon(page)).toMatch(/\/favicon\.svg$/)
})

test('un .gif y un archivo de más de 2 MB se rechazan con mensaje, sin subir nada', async ({ page }) => {
  const subidas: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/storage/v1/')) subidas.push(r.url())
  })
  await loginAdmin(page)
  await abrirConfiguracion(page)

  await page.getByLabel('Archivo del logo').setInputFiles({ name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') })
  await expect(page.getByText('Formato no admitido. Subí una imagen PNG, JPG o WebP.')).toBeVisible()

  const grande = Buffer.concat([crearPng(), Buffer.alloc(3 * 1024 * 1024)])
  await page.getByLabel('Archivo del logo').setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: grande })
  await expect(page.getByText('La imagen supera el tamaño máximo de 2 MB.')).toBeVisible()

  expect(subidas).toEqual([])
  expect(await objetosDelBucket()).toEqual([])
  await expect(page.locator(IMG_LOGO)).toHaveCount(0)
})
