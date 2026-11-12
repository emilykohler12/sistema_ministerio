# Plan: carrera en e2e/padron.spec.ts (#64)

## Objetivo
Que `padron.spec.ts` no falle por azar: tras «Editar» (navegación del lado del cliente con ruta `lazy`) el test puede tocar `getByLabel('Localidad')` antes de que monte el formulario y caer en el filtro de la lista. Mismo arreglo que #40.

## Archivos
- `e2e/padron.spec.ts` (líneas 69 y 83): dos clics en «Editar», en el test de duplicados y en el de cambio de localidad.
- `e2e/helpers.ts`: `loginAdmin` (línea 14).

## Pasos
1. Helper `abrirEdicionEstablecimiento(page, nombre)` en `padron.spec.ts`: clic en «Editar» de la fila y `expect` del encabezado «Editar establecimiento» (nivel 1) visible antes de seguir. Usarlo en los dos lugares.
2. `loginAdmin`: dar más margen (`timeout: 15_000`) solo al `expect` del encabezado «Dashboard», por la compilación en frío del servidor bajo CPU saturada. La causa no está verificada; el cambio no tapa fallos reales porque solo alarga la espera cuando el encabezado no aparece.
3. Sin cambios de código de producción.

## Cómo se verifica
- `npm run db:reset && npx playwright test e2e/padron.spec.ts --repeat-each=10` sin fallos, y también con carga de CPU en paralelo (`--repeat-each=10` junto a un proceso que sature la CPU), contra el Supabase local.
- Mutación: con el `await expect` del encabezado quitado del helper, el test debe poder fallar bajo carga (si no falla, decirlo).
- `npm run lint` y `npm run typecheck`; al final `npm run test:e2e` completo y `npm run db:reset`.
- Revisor sobre el diff (escribe `revision.md`). Sin `qa`: no toca Storage, RLS ni rutas.

## Fuera de alcance
La causa de fondo de las rutas `lazy` y cualquier otro spec que no esté en #64.
