# E2e propuesto para `e2e/subida-reanudable.spec.ts` (insumo para `qa`)

Lo redactó el `test-writer` en la fase RED. No pudo crear el archivo (su perfil no escribe en `e2e/`; el e2e lo escribe `qa` después de implementar, ADR 0020) y no se corrió. `qa` lo toma como punto de partida y lo ajusta al DOM real.

Reglas: esperas por evento (promesas que el test suelta), no por tiempo (#61). Buffer de ~13 MiB (tres trozos de 6 MiB) y `page.route` sobre `/storage/v1/upload/resumable`. El local usa el backend de archivos: no cubre la regla de trozos de 6 MiB de S3 (paso manual 7 de la spec).

```ts
import { expect, test, type Page, type Route } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

const MIB = 1024 * 1024
const TUS = /\/storage\/v1\/upload\/resumable/
const grande = (nombre: string) => ({ name: nombre, mimeType: 'application/pdf', buffer: Buffer.alloc(13 * MIB) })
const chico = (nombre: string) => ({
  name: nombre,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'),
})
function compuerta() {
  let soltar!: () => void
  const abierta = new Promise<void>((resolver) => (soltar = resolver))
  return { abierta, soltar }
}
const esPatch = (route: Route) => route.request().method() === 'PATCH'
const offsetDe = (route: Route) => Number(route.request().headers()['upload-offset'])
const continuar = (route: Route) => route.continue().catch(() => {})

async function prepararTaller(page: Page) {
  const s = sufijoUnico()
  await loginAdmin(page)
  await crearTaller(page, { nombre: `Taller Subida ${s}`, categoria: `Cat Subida ${s}`, estado: 'Borrador' })
  await expect(page.getByText('Todavía no hay recursos en este taller')).toBeVisible()
  const items = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Subir / }) })
  return { s, items }
}

test.describe('subida reanudable de recursos', () => {
  test('sube un archivo de tres trozos, muestra progreso intermedio y el recurso aparece', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const nombre = `grande${s}`
    const segundoTrozo = compuerta(); const retenido = compuerta(); let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) { segundoTrozo.soltar(); await retenido.abierta }
      await continuar(route)
    })
    await page.locator('input[type=file]').first().setInputFiles(grande(`${nombre}.pdf`))
    await segundoTrozo.abierta
    const barra = page.getByRole('progressbar', { name: `${nombre}.pdf` })
    await expect.poll(async () => Number(await barra.getAttribute('value'))).toBeGreaterThan(0)
    expect(Number(await barra.getAttribute('value'))).toBeLessThan(100)
    await expect(page.getByRole('button', { name: /^Cancelar/ })).toBeVisible()
    retenido.soltar()
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText(nombre)
    await expect(page.getByRole('progressbar', { name: `${nombre}.pdf` })).toHaveCount(0)
  })

  test('un PATCH cortado se reintenta solo, dice "Sin conexión, reintentando…" y retoma desde el último trozo confirmado', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const nombre = `corte${s}`
    const offsets: number[] = []; const head = compuerta()
    await page.route(TUS, async (route) => {
      if (esPatch(route)) { offsets.push(offsetDe(route)); if (offsets.length === 2) return route.abort('connectionfailed') }
      if (route.request().method() === 'HEAD') await head.abierta
      return continuar(route)
    })
    await page.locator('input[type=file]').first().setInputFiles(grande(`${nombre}.pdf`))
    await expect(page.getByText('Sin conexión, reintentando…')).toBeVisible()
    head.soltar()
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText(nombre)
    expect(offsets).toEqual([0, 6 * MIB, 6 * MIB, 12 * MIB])
  })

  test('cancelar durante una demora aborta el upload en el servidor y no crea ninguna fila', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const nombre = `cancelada${s}`
    const retenido = compuerta(); const visto = compuerta(); let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) { visto.soltar(); await retenido.abierta }
      await continuar(route)
    })
    await page.locator('input[type=file]').first().setInputFiles(grande(`${nombre}.pdf`))
    await visto.abierta
    const borrado = page.waitForRequest((r) => r.method() === 'DELETE' && TUS.test(r.url()))
    await page.getByRole('button', { name: /^Cancelar/ }).click()
    await borrado
    retenido.soltar()
    await expect(page.getByRole('progressbar', { name: `${nombre}.pdf` })).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText(/cancelad/i)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(items).toHaveCount(0)
    await expect(page.getByText('Todavía no hay recursos en este taller')).toBeVisible()
  })

  test('cancelar un reemplazo conserva el archivo anterior', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const nombre = `original${s}`
    await page.locator('input[type=file]').first().setInputFiles(chico(`${nombre}.pdf`))
    await expect(items).toHaveCount(1)
    const antes = await items.first().textContent()
    const retenido = compuerta(); const visto = compuerta(); let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) { visto.soltar(); await retenido.abierta }
      await continuar(route)
    })
    await page.getByLabel(`Archivo nuevo para ${nombre}`).setInputFiles(grande('reemplazo.pdf'))
    await visto.abierta
    await expect(items.first().getByRole('progressbar', { name: 'reemplazo.pdf' })).toBeVisible()
    const borrado = page.waitForRequest((r) => r.method() === 'DELETE' && TUS.test(r.url()))
    await items.first().getByRole('button', { name: /^Cancelar/ }).click()
    await borrado
    retenido.soltar()
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(items.first()).toHaveText(antes!)
    await page.reload()
    await expect(items.first()).toHaveText(antes!)
  })
})
```

Notas para `qa`: verificar que `crearTaller`/`sufijoUnico` existan en `e2e/helpers.ts` con esa firma; el «botón del dropzone» es el `input[type=file][multiple]` oculto con `sr-only`; los anuncios del `role="status"` incluyen el nombre del archivo y nunca porcentajes. El corte de red real (DevTools → Offline) y el `beforeunload` con diálogo no se automatizan: son verificación manual.
