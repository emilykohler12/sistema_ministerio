import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

// Recuperación de contraseña (#21). Usa recuperacion@dam.local (sembrado solo para esto) y Mailpit local.
// La contraseña de esa cuenta cambia en cada corrida: cada test fija una aleatoria y nunca depende de la anterior.
const BASE = 'http://localhost:5173'
const MAILPIT = 'http://127.0.0.1:54324/api/v1'
const CUENTA = 'recuperacion@dam.local'
const AVISO_NEUTRO = /Si el correo corresponde a una cuenta, te enviamos un enlace/

const aleatoria = () => `Aa1-${crypto.randomUUID()}`

/** Pide el enlace por la UI y devuelve el token_hash del último correo del destinatario. */
async function pedirEnlace(page: Page, request: APIRequestContext, correo: string) {
  await request.delete(`${MAILPIT}/messages`)
  await page.goto('/admin/recuperar')
  await page.getByLabel('Correo electrónico').fill(correo)
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByRole('status')).toContainText('Si el correo corresponde')
  let html = ''
  let asunto = ''
  await expect
    .poll(async () => {
      const lista = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${correo}`)}`)).json()
      const ultimo = lista.messages?.[0]
      if (!ultimo) return false
      const detalle = await (await request.get(`${MAILPIT}/message/${ultimo.ID}`)).json()
      html = detalle.HTML as string
      asunto = detalle.Subject as string
      return true
    })
    .toBe(true)
  const tokenHash = /token_hash=([^&"'\s]+)/.exec(html)![1]
  return { tokenHash, html, asunto }
}

async function guardarContrasena(page: Page, password: string, confirmacion = password) {
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(password)
  await page.getByLabel('Confirmá la contraseña').fill(confirmacion)
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
}

/** Flujo completo en un contexto aparte: deja la contraseña de la cuenta en `password`. */
async function fijarContrasena(browser: Browser, request: APIRequestContext, correo: string, password: string) {
  const ctxPedido = await browser.newContext({ baseURL: BASE })
  const pedido = await ctxPedido.newPage()
  const { tokenHash } = await pedirEnlace(pedido, request, correo)
  await ctxPedido.close()
  const ctx = await browser.newContext({ baseURL: BASE })
  const page = await ctx.newPage()
  await page.goto(`/admin/nueva-contrasena?token_hash=${tokenHash}&type=recovery`)
  await guardarContrasena(page, password)
  await expect(page).toHaveURL(/\/admin\/login/)
  await ctx.close()
  return tokenHash
}

async function ingresar(page: Page, correo: string, password: string) {
  await page.goto('/admin/login')
  await page.getByLabel('Correo electrónico').fill(correo)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

test('login enlaza a recuperar; aviso neutro igual para cuenta real e inexistente; correo mal formado no llama', async ({
  page,
  request,
}) => {
  await page.goto('/admin/login')
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
  await expect(page).toHaveURL(/\/admin\/recuperar$/)

  let llamadas = 0
  page.on('request', (r) => {
    if (r.url().includes('/auth/v1/recover')) llamadas++
  })
  await page.getByLabel('Correo electrónico').fill('no-es-un-correo')
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  const campo = page.getByLabel('Correo electrónico')
  await expect(campo).toHaveAccessibleDescription(/.+/)
  expect(llamadas).toBe(0)

  await request.delete(`${MAILPIT}/messages`)
  const textos: string[] = []
  for (const correo of [CUENTA, `no-existe-${Date.now()}@dam.local`]) {
    await page.goto('/admin/recuperar')
    await page.getByLabel('Correo electrónico').fill(correo)
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    const aviso = page.getByRole('status')
    await expect(aviso).toHaveText(AVISO_NEUTRO)
    await expect(aviso).toBeFocused()
    textos.push((await aviso.textContent()) ?? '')
  }
  expect(textos[0]).toBe(textos[1])
  // Solo llegó el correo de la cuenta real.
  await expect
    .poll(async () => (await (await request.get(`${MAILPIT}/messages`)).json()).total)
    .toBe(1)
})

test('el correo llega en español y su enlace, abierto en otro contexto, muestra el formulario sin sesión', async ({
  page,
  request,
  browser,
}) => {
  const { html, asunto, tokenHash } = await pedirEnlace(page, request, CUENTA)
  expect(asunto).toBe('Recuperá tu contraseña del panel DAM')
  expect(html).toContain('Elegir una contraseña nueva')
  expect(html).toContain('/admin/nueva-contrasena?token_hash=')

  const ctx = await browser.newContext({ baseURL: BASE })
  const otra = await ctx.newPage()
  await otra.goto(`/admin/nueva-contrasena?token_hash=${tokenHash}&type=recovery`)
  await expect(otra.getByRole('heading', { name: 'Contraseña nueva' })).toBeVisible()
  await expect(otra.getByLabel('Contraseña nueva', { exact: true })).toBeVisible()
  await otra.goto('/admin')
  await expect(otra).toHaveURL(/\/admin\/login/)
  await otra.goto(`/admin/nueva-contrasena?token_hash=${tokenHash}&type=recovery`)
  await otra.reload()
  await expect(otra.getByLabel('Contraseña nueva', { exact: true })).toBeVisible()
  await otra.goto('/admin')
  await expect(otra).toHaveURL(/\/admin\/login/)
  // Abrir el enlace no gastó el token: sigue sirviendo.
  await otra.goto(`/admin/nueva-contrasena?token_hash=${tokenHash}&type=recovery`)
  await guardarContrasena(otra, aleatoria())
  await expect(otra).toHaveURL(/\/admin\/login/)
  await ctx.close()
})

test('validaciones, same_password con salida al login, cambio válido, enlace gastado y vieja contraseña', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(90_000)
  const p1 = aleatoria()
  const tokenUsado = await fijarContrasena(browser, request, CUENTA, p1)

  const { tokenHash } = await pedirEnlace(page, request, CUENTA)
  await page.goto(`/admin/nueva-contrasena?token_hash=${tokenHash}&type=recovery`)

  await guardarContrasena(page, 'Abc1234') // 7 caracteres
  await expect(page.getByLabel('Contraseña nueva', { exact: true })).toHaveAccessibleDescription(/8/)
  await guardarContrasena(page, 'Abcdefg1-x', 'Distinta-123')
  await expect(page.getByLabel('Confirmá la contraseña')).toHaveAccessibleDescription(/.+/)

  // La contraseña actual.
  await guardarContrasena(page, p1)
  const alerta = page.getByRole('alert')
  await expect(alerta).toContainText('Esa ya es tu contraseña actual')
  await expect(alerta).toBeFocused()
  await alerta.getByRole('link', { name: 'Ir a ingresar' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()

  // Enlace ya consumido por el intento anterior.
  await page.goto(`/admin/nueva-contrasena?token_hash=${tokenHash}&type=recovery`)
  await guardarContrasena(page, aleatoria())
  await expect(page.getByRole('alert')).toContainText('El enlace venció o ya se usó')
  await expect(page.getByRole('link', { name: 'Pedir otro enlace' })).toBeVisible()

  // Cambio válido con un enlace nuevo.
  const p2 = aleatoria()
  await fijarContrasena(browser, request, CUENTA, p2)

  await page.goto(`/admin/nueva-contrasena?token_hash=${tokenUsado}&type=recovery`)
  await guardarContrasena(page, aleatoria())
  await expect(page.getByRole('alert')).toContainText('El enlace venció o ya se usó')
  await page.goto('/admin/nueva-contrasena')
  await expect(page.getByRole('alert')).toContainText('El enlace venció o ya se usó')
  await expect(page.getByRole('link', { name: 'Pedir otro enlace' })).toBeVisible()

  await ingresar(page, CUENTA, p1)
  await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible()
  await ingresar(page, CUENTA, p2)
  await expect(page).toHaveURL(/\/admin$/)
})

test('éxito: login con aviso enfocado, token fuera de la URL y las otras sesiones no se renuevan', async ({
  request,
  browser,
}) => {
  test.setTimeout(90_000)
  const p1 = aleatoria()
  await fijarContrasena(browser, request, CUENTA, p1)

  // Sesión A (otra persona/navegador) abierta con la contraseña vigente.
  const ctxA = await browser.newContext({ baseURL: BASE })
  const a = await ctxA.newPage()
  let apikey = ''
  a.on('request', (r) => {
    const k = r.headers()['apikey']
    if (k && r.url().includes('/auth/v1/')) apikey = k
  })
  await ingresar(a, CUENTA, p1)
  await expect(a).toHaveURL(/\/admin$/)
  const leer = () =>
    a.evaluate(() => {
      return JSON.parse(sessionStorage.getItem('dam-auth-sesion')!) as { refresh_token: string }
    })
  const refrescar = (refresh_token: string) =>
    a.evaluate(
      async ({ refresh_token, apikey }) => {
        const r = await fetch(`http://127.0.0.1:54321/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token }),
        })
        return { status: r.status, body: (await r.json()) as { refresh_token?: string } }
      },
      { refresh_token, apikey },
    )
  // Control: antes del cambio el refresh token sí renueva.
  const antes = await refrescar((await leer()).refresh_token)
  expect(antes.status).toBe(200)
  const viejo = antes.body.refresh_token!

  // Cambio de contraseña desde otro contexto.
  const p2 = aleatoria()
  const ctxB = await browser.newContext({ baseURL: BASE })
  const b = await ctxB.newPage()
  const { tokenHash } = await pedirEnlace(b, request, CUENTA)
  await b.goto(`/admin/nueva-contrasena?token_hash=${tokenHash}&type=recovery`)
  await guardarContrasena(b, p2)
  await expect(b).toHaveURL(/\/admin\/login$/)
  expect(b.url()).not.toContain('token_hash')
  const aviso = b.getByRole('status')
  await expect(aviso).toHaveText('Contraseña actualizada. Ingresá con la nueva.')
  await expect(aviso).toBeFocused()
  await b.goBack()
  expect(b.url()).not.toContain('token_hash=' + tokenHash + '&type=recovery#')
  await ctxB.close()

  const despues = await refrescar(viejo)
  expect(despues.status).toBeGreaterThanOrEqual(400)
  await ctxA.close()
})

test('una cuenta sin la marca admin no cambia la contraseña', async ({ page, request, browser }) => {
  test.setTimeout(60_000)
  const { tokenHash } = await pedirEnlace(page, request, 'sin-permiso@dam.local')
  const ctx = await browser.newContext({ baseURL: BASE })
  const otra = await ctx.newPage()
  await otra.goto(`/admin/nueva-contrasena?token_hash=${tokenHash}&type=recovery`)
  await guardarContrasena(otra, aleatoria())
  await expect(otra.getByRole('alert')).toContainText('Tu cuenta no tiene permisos de administrador')
  await ctx.close()
  // La contraseña sembrada sigue valiendo (el login la acepta y solo rechaza por permisos).
  await ingresar(page, 'sin-permiso@dam.local', 'sin-permiso-dam-local')
  await expect(page.getByText('Tu cuenta no tiene permisos de administrador')).toBeVisible()
  await expect(page.getByText('Correo o contraseña incorrectos')).toHaveCount(0)
})

test('sin scroll horizontal en 320 px en las tres pantallas', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  for (const ruta of ['/admin/login', '/admin/recuperar', '/admin/nueva-contrasena?token_hash=x']) {
    await page.goto(ruta)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(desborda, ruta).toBe(false)
  }
})

test('teclado: Tab recorre campo, botón y enlace en recuperar', async ({ page }) => {
  await page.goto('/admin/recuperar')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Correo electrónico')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Volver a ingresar' })).toBeFocused()
})
