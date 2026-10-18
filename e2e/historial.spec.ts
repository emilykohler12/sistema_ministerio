import { expect, test, type Page } from '@playwright/test'
import { crearTaller, loginAdmin, sufijoUnico } from './helpers.ts'

/** Captura apikey y origen del primer request a /rest/v1/ tras recargar. */
async function credenciales(page: Page) {
  let apikey = ''
  let origen = ''
  page.on('request', (r) => {
    const k = r.headers()['apikey']
    if (k && r.url().includes('/rest/v1/')) {
      apikey = k
      origen = new URL(r.url()).origin
    }
  })
  await page.reload()
  await expect.poll(() => apikey).not.toBe('')
  return { apikey, origen }
}

test('historial: un taller creado, editado y con un recurso borrado se ve con email, puentes agrupadas y diff', async ({
  page,
}) => {
  const s = sufijoUnico()
  const nombre = `Taller Hist ${s}`
  await loginAdmin(page)
  const id = await crearTaller(page, { nombre, categoria: `Cat Hist ${s}`, estado: 'Borrador', etiqueta: `eti${s}` })

  // Un recurso (enlace) y su baja.
  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Nombre').fill(`Enlace ${s}`)
  await dlg.getByLabel('URL').fill('https://example.com/material')
  await dlg.getByRole('button', { name: 'Agregar' }).click()
  await expect(page.getByText(`Enlace ${s}`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Eliminar Enlace ${s}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText(`Enlace ${s}`, { exact: true })).toHaveCount(0)

  // Edición con cambio de estado y edición sin cambios (solo updated_at).
  expect(id).toBeGreaterThan(0)
  const urlEditar = page.url().replace(/\/recursos$/, '/editar')
  await page.goto(urlEditar)
  await page.getByLabel('Descripción').fill(`Descripción nueva ${s}`)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page).not.toHaveURL(/editar/)
  // Guardar sin cambiar nada: solo se mueve updated_at.
  await page.goto(urlEditar)
  await expect(page.getByLabel('Descripción')).toHaveValue(`Descripción nueva ${s}`)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page).not.toHaveURL(/editar/)

  // Menú y ruta.
  await page.getByRole('link', { name: 'Historial' }).click()
  await expect(page).toHaveURL(/\/admin\/historial$/)
  await expect(page.getByRole('heading', { name: 'Historial', level: 1 })).toBeVisible()

  await page.getByLabel('Entidad').selectOption({ label: 'Taller' })
  await expect(page).toHaveURL(/entidad=taller/)
  const tabla = page.getByRole('table', { name: 'Operaciones' })
  const fila = tabla.getByRole('row', { name: new RegExp(`Taller.*${nombre}`) }).first()
  await expect(fila).toBeVisible()
  await expect(fila).toContainText('admin@dam.local')
  // Entidad Taller agrupa las puentes: solo hay filas "Taller".
  await expect(tabla.getByRole('cell', { name: 'Taller', exact: true }).first()).toBeVisible()
  await expect(tabla.getByRole('cell', { name: 'Recurso', exact: true })).toHaveCount(0)

  // La modificación solo de updated_at no se expande.
  await expect(page.getByText('Sin cambios en los campos del registro').first()).toBeVisible()

  // La modificación: el diff solo trae lo que cambió.
  const mod = tabla
    .getByRole('row', { name: /Modificación/ })
    .filter({ hasText: nombre })
    .filter({ has: page.getByRole('button', { name: /Cambios de/ }) })
    .first()
  await mod.getByRole('button', { name: /Cambios de/ }).click()
  const diff = page.getByRole('table', { name: 'Cambios del registro' })
  await expect(diff).toBeVisible()
  await expect(diff.getByRole('rowheader', { name: 'descripcion' })).toBeVisible()
  await expect(diff.getByRole('rowheader', { name: 'updated_at' })).toHaveCount(0)
  await expect(diff.getByRole('rowheader', { name: 'nombre' })).toHaveCount(0)

  // Baja del recurso.
  await page.getByLabel('Entidad').selectOption({ label: 'Recurso' })
  await expect(page.getByRole('table', { name: 'Operaciones' }).getByText('Baja').first()).toBeVisible()
})

test('historial: filtros inválidos, vacíos y URL compartible', async ({ page, context }) => {
  await loginAdmin(page)
  const errores: string[] = []
  page.on('console', (m) => {
    // El 416 es el PGRST103 esperado de ?pagina=999 (el navegador lo registra aunque la app lo maneje).
    if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('416')) errores.push(m.text())
  })

  // Rango invertido: error junto a los campos, sin consulta de operaciones.
  let consultas = 0
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/registro_operacion')) consultas++
  })
  await page.goto('/admin/historial?desde=2025-03-10&hasta=2025-03-01')
  await expect(page.getByText(/anterior|posterior|desde/i).first()).toBeVisible()
  await expect(page.getByLabel('Desde')).toHaveAttribute('aria-describedby', /.+/)
  expect(consultas).toBe(0)
  await expect(page.getByRole('table', { name: 'Operaciones' })).toHaveCount(0)

  // Usuario "Sistema": vacío.
  await page.goto('/admin/historial')
  await expect(page.getByRole('table', { name: 'Operaciones' })).toBeVisible()
  await page.getByLabel('Usuario').selectOption({ label: 'Sistema' })
  await expect(page).toHaveURL(/usuario=sistema/)
  await expect(page.getByText('No hay operaciones para los filtros elegidos.')).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(page.getByRole('table', { name: 'Operaciones' })).toBeVisible()
  await expect(page).not.toHaveURL(/usuario=/)

  // Página fuera de rango (PGRST103).
  await page.goto('/admin/historial?pagina=999')
  await expect(page.getByText('Esa página no existe.')).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(page.getByRole('table', { name: 'Operaciones' })).toBeVisible()

  // Valores inválidos se descartan.
  await page.goto('/admin/historial?usuario=x&entidad=x')
  await expect(page.getByRole('table', { name: 'Operaciones' })).toBeVisible()
  await expect(page.getByLabel('Usuario')).toHaveValue('')
  await expect(page.getByLabel('Entidad')).toHaveValue('')

  // Fecha escrita con el teclado: una consulta, y Atrás vuelve a la vista anterior.
  await page.goto('/admin/historial')
  await expect(page.getByRole('table', { name: 'Operaciones' })).toBeVisible()
  consultas = 0
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const [y, m, d] = hoy.split('-')
  await page.getByLabel('Desde').focus() // el clic cae en el segmento del año
  await page.keyboard.type(`${m}${d}${y}`) // Chromium en-US: mm/dd/aaaa
  await expect(page).toHaveURL(new RegExp(`desde=${hoy}`))
  await expect(page.getByRole('table', { name: 'Operaciones' })).toBeVisible()
  expect(consultas).toBe(1)

  // La URL abre igual en otra pestaña.
  // (la sesión vive en sessionStorage: la pestaña nueva pide login, y la URL se conserva al volver con una navegación directa)
  const url = page.url()
  const otra = await context.newPage()
  await loginAdmin(otra)
  await otra.goto(url)
  await expect(otra.getByLabel('Desde')).toHaveValue(hoy)
  await expect(otra.getByRole('table', { name: 'Operaciones' })).toBeVisible()

  expect(errores, errores.join('\n')).toEqual([])
})

test('historial: paginación con teclado de más de 50 operaciones', async ({ page }) => {
  await loginAdmin(page)
  const { apikey, origen } = await credenciales(page)
  await page.evaluate(
    async ([o, k]) => {
      const t = await fetch(`${o}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: k, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@dam.local', password: 'admin-dam-local' }),
      }).then((r) => r.json() as Promise<{ access_token: string }>)
      for (let i = 0; i < 55; i++) {
        await fetch(`${o}/rest/v1/configuracion?id=eq.1`, {
          method: 'PATCH',
          headers: { apikey: k, Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefono: `0376-${Date.now()}-${i}` }),
        })
      }
    },
    [origen, apikey] as const,
  )
  await page.goto('/admin/historial')
  await expect(page.getByText(/Página 1 de \d+/)).toBeVisible()
  const siguiente = page.getByRole('button', { name: 'Siguiente' })
  await siguiente.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/pagina=2/)
  await expect(page.getByText(/Página 2 de \d+/)).toBeVisible()
  await expect(page.getByText(/^\d[\d.]* operaci/)).toBeFocused()
})

test('historial: una cuenta sin permiso no ve operaciones y la RPC de usuarios da 42501', async ({ page }) => {
  await loginAdmin(page)
  const { apikey, origen } = await credenciales(page)
  const res = await page.evaluate(
    async ([o, k]) => {
      const t = await fetch(`${o}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: k, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sin-permiso@dam.local', password: 'sin-permiso-dam-local' }),
      }).then((r) => r.json() as Promise<{ access_token: string }>)
      const h = (token: string) => ({ apikey: k, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })
      const filas = await fetch(`${o}/rest/v1/registro_operacion?select=id`, { headers: h(t.access_token) }).then((r) =>
        r.text(),
      )
      const rpc = async (token: string) => {
        const r = await fetch(`${o}/rest/v1/rpc/usuarios_historial`, { method: 'POST', headers: h(token), body: '{}' })
        return { status: r.status, cuerpo: await r.text() }
      }
      return { filas, sinPermiso: await rpc(t.access_token), anon: await rpc(k) }
    },
    [origen, apikey] as const,
  )
  expect(res.filas).toBe('[]')
  expect(res.sinPermiso.status).toBeGreaterThanOrEqual(400)
  expect(res.sinPermiso.cuerpo).toContain('42501')
  expect(res.anon.status).toBeGreaterThanOrEqual(400)
  expect(res.anon.cuerpo).toContain('42501')
})
