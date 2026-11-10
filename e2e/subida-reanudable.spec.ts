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
const esDelete = (r: { method(): string; url(): string }) => r.method() === 'DELETE' && TUS.test(r.url())

async function prepararTaller(page: Page) {
  const s = sufijoUnico()
  await loginAdmin(page)
  const id = await crearTaller(page, { nombre: `Taller Subida ${s}`, categoria: `Cat Subida ${s}`, estado: 'Borrador' })
  await expect(page.getByText('Todavía no hay recursos en este taller')).toBeVisible()
  const items = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Subir / }) })
  return { s, id, items }
}

const dropzone = (page: Page) => page.locator('input[type=file]').first()
const barra = (page: Page, nombre: string) => page.getByRole('progressbar', { name: nombre })
const cancelar = (page: Page, nombre: string) => page.getByRole('button', { name: `Cancelar la subida de ${nombre}` })

test.describe('subida reanudable de recursos', () => {
  test('sube un archivo de tres trozos, muestra progreso intermedio y el recurso aparece', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const nombre = `grande${s}`
    const segundoTrozo = compuerta()
    const retenido = compuerta()
    let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) {
        segundoTrozo.soltar()
        await retenido.abierta
      }
      await continuar(route)
    })
    await dropzone(page).setInputFiles(grande(`${nombre}.pdf`))
    await segundoTrozo.abierta
    const b = barra(page, `${nombre}.pdf`)
    await expect.poll(async () => Number(await b.getAttribute('value'))).toBeGreaterThan(0)
    expect(Number(await b.getAttribute('value'))).toBeLessThan(100)
    await expect(cancelar(page, `${nombre}.pdf`)).toBeVisible()
    retenido.soltar()
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText(nombre)
    await expect(barra(page, `${nombre}.pdf`)).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: /./ })).toContainText(`${nombre}.pdf subido`)
  })

  test('un PATCH cortado se reintenta, dice "Sin conexión, reintentando…" y retoma desde el último trozo confirmado', async ({
    page,
  }) => {
    const { s, items } = await prepararTaller(page)
    const nombre = `corte${s}`
    const offsets: number[] = []
    const head = compuerta()
    await page.route(TUS, async (route) => {
      if (esPatch(route)) {
        offsets.push(offsetDe(route))
        if (offsets.length === 2) return route.abort('connectionfailed')
      }
      if (route.request().method() === 'HEAD') await head.abierta
      return continuar(route)
    })
    await dropzone(page).setInputFiles(grande(`${nombre}.pdf`))
    await expect(page.getByText('Sin conexión, reintentando…', { exact: true })).toBeVisible()
    head.soltar()
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText(nombre)
    expect(offsets[0]).toBe(0)
    expect(offsets.slice(2).every((o) => o >= 6 * MIB)).toBe(true)
    expect(offsets.at(-1)).toBeGreaterThan(0)
  })

  test('cancelar durante una demora aborta el upload en el servidor y no crea ninguna fila', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const nombre = `cancelada${s}`
    const retenido = compuerta()
    const visto = compuerta()
    let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) {
        visto.soltar()
        await retenido.abierta
      }
      await continuar(route)
    })
    await dropzone(page).setInputFiles(grande(`${nombre}.pdf`))
    await visto.abierta
    const borrado = page.waitForRequest(esDelete)
    await cancelar(page, `${nombre}.pdf`).click()
    await borrado
    retenido.soltar()
    await expect(barra(page, `${nombre}.pdf`)).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: /./ })).toContainText(`${nombre}.pdf cancelado`)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(items).toHaveCount(0)
    await expect(page.getByText('Todavía no hay recursos en este taller')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Todavía no hay recursos en este taller')).toBeVisible()
  })

  test('cancelar un reemplazo conserva el archivo anterior, también tras recargar', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const nombre = `original${s}`
    await dropzone(page).setInputFiles(chico(`${nombre}.pdf`))
    await expect(items).toHaveCount(1)
    const antes = await items.first().textContent()
    const retenido = compuerta()
    const visto = compuerta()
    let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) {
        visto.soltar()
        await retenido.abierta
      }
      await continuar(route)
    })
    await page.getByLabel(`Archivo nuevo para ${nombre}`).setInputFiles(grande('reemplazo.pdf'))
    await visto.abierta
    await expect(barra(page, 'reemplazo.pdf')).toBeVisible()
    const borrado = page.waitForRequest(esDelete)
    await cancelar(page, 'reemplazo.pdf').click()
    await borrado
    retenido.soltar()
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(items.first()).toHaveText(antes!)
    await expect(page.getByRole('button', { name: `Reemplazar ${nombre}` })).toBeFocused()
    await page.reload()
    await expect(items.first()).toHaveText(antes!)
  })

  test('un 413 al crear el upload muestra el mensaje de siempre y el lote sigue', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const malo = `rechazado${s}`
    const bueno = `bueno${s}`
    let rechazado = false
    await page.route(TUS, async (route) => {
      if (route.request().method() === 'POST' && !rechazado) {
        rechazado = true
        return route.fulfill({
          status: 413,
          contentType: 'application/json',
          body: JSON.stringify({ statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }),
        })
      }
      return continuar(route)
    })
    await dropzone(page).setInputFiles([chico(`${malo}.pdf`), chico(`${bueno}.pdf`)])
    await expect(page.getByRole('alert')).toContainText(`${malo}.pdf`)
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText(bueno)
  })

  test('en un lote de dos, cancelar el que espera no frena al que sube', async ({ page }) => {
    const { s, items } = await prepararTaller(page)
    const a = `primero${s}`
    const b = `segundo${s}`
    const retenido = compuerta()
    const visto = compuerta()
    let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) {
        visto.soltar()
        await retenido.abierta
      }
      await continuar(route)
    })
    await dropzone(page).setInputFiles([grande(`${a}.pdf`), chico(`${b}.pdf`)])
    await visto.abierta
    await expect(page.getByText('En espera')).toBeVisible()
    await cancelar(page, `${b}.pdf`).click()
    await expect(page.getByText('En espera')).toHaveCount(0)
    retenido.soltar()
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText(a)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('«Cancelar» se opera con teclado, el foco vuelve al dropzone y no hay errores de consola', async ({ page }) => {
    const consola: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consola.push(`${m.type()}: ${m.text()}`)
    })
    page.on('pageerror', (e) => consola.push(`pageerror: ${e.message}`))
    const { s } = await prepararTaller(page)
    const nombre = `teclado${s}`
    const retenido = compuerta()
    const visto = compuerta()
    let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) {
        visto.soltar()
        await retenido.abierta
      }
      await continuar(route)
    })
    consola.length = 0
    await dropzone(page).setInputFiles(grande(`${nombre}.pdf`))
    await visto.abierta
    const boton = cancelar(page, `${nombre}.pdf`)
    await boton.focus()
    await expect(boton).toBeFocused()
    const borrado = page.waitForRequest(esDelete)
    await page.keyboard.press('Enter')
    await borrado
    retenido.soltar()
    await expect(barra(page, `${nombre}.pdf`)).toHaveCount(0)
    await expect(dropzone(page)).toBeFocused()
    expect(consola).toEqual([])
  })

  test('navegar a otra pantalla durante una subida la aborta y no crea la fila', async ({ page }) => {
    const { s, id } = await prepararTaller(page)
    const nombre = `huida${s}`
    const retenido = compuerta()
    const visto = compuerta()
    let patches = 0
    await page.route(TUS, async (route) => {
      if (esPatch(route) && ++patches === 2) {
        visto.soltar()
        await retenido.abierta
      }
      await continuar(route)
    })
    await dropzone(page).setInputFiles(grande(`${nombre}.pdf`))
    await visto.abierta
    const borrado = page.waitForRequest(esDelete)
    await page.getByRole('link', { name: 'Dashboard' }).first().click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page).toHaveURL(/\/admin$/)
    await borrado
    retenido.soltar()
    await page.unroute(TUS)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/${id}/recursos$`))
    await expect(page.getByText('Todavía no hay recursos en este taller')).toBeVisible()
  })
})
