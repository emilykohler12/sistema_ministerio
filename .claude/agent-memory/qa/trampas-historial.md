---
name: trampas-historial
description: Trampas del e2e de /admin/historial (input date, sesión por pestaña, 416, filas sin botón)
metadata:
  type: project
---
- Input date en Chromium es mm/dd/aaaa: `focus()` (no `click()`, que cae en el año) y `keyboard.type(mmddaaaa)`.
- La sesión admin está en sessionStorage: una pestaña nueva pide login (`loginAdmin(otra)` y luego `goto(url)`).
- `?pagina=999` deja un `416` en consola (PGRST103 manejado): filtrarlo en los chequeos de consola.
- Modificación solo de `updated_at` = guardar el taller sin cambios en `/editar`; esa fila no tiene botón "Cambios de": filtrar filas con `has: getByRole('button',{name:/Cambios de/})`.
- >50 filas: 55 PATCH a `configuracion?id=eq.1` con token admin (password grant) desde `page.evaluate`.
- `normativas-admin.spec.ts:22` falló una vez en la corrida completa y pasa aislada (flaky).
