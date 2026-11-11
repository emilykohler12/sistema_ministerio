# Revisión 1

Alcance: diff sin commitear de `fix/e2e-flaky-carga` contra `main` (`playwright.config.ts`, `e2e/normativas-admin.spec.ts`,
`e2e/recuperacion-password.spec.ts`) frente a `plan.md`, incluida su sección «Resultados de la implementación».

## Veredicto
Aprobado

## Problemas
Ninguno que bloquee. Lo que pide el plan está hecho y el resto del diff queda dentro del alcance.

- Cambio 1 (`timeout: 60_000`): `playwright.config.ts:10`. No hay `expect.timeout` configurado, así que los `expect` siguen en
  5 s. Los tres `test.setTimeout(60_000)` de `recuperacion-password.spec.ts` (en `main`, líneas 243, 263 y 311) quedaban
  redundantes y se quitaron sin cambiar nada. Eran tres y no cuatro: en `main` solo había esos tres. Se mantienen los tres de
  90 s (líneas 134, 182 y 283), que pisan el valor global, y el `test.setTimeout(240_000)` de `limpiar-storage.spec.ts:30`
  quedó igual. No hay `test.slow()` ni `describe.configure({ timeout })`. El global además le da margen al
  `expect.poll(..., { timeout: 30_000 })` de `signout-sin-red.spec.ts:64`, que con 30 s de test no lo tenía. El timeout del
  `webServer` y el `globalSetup` no dependen de este valor.
- Cambio 2 (historial): descartado, como dice el plan. `git diff main -- e2e/historial.spec.ts` sale vacío.
- Cambio 3 (#40): el diagnóstico es correcto, y lo confirmé leyendo el código:
  - `NormativasAdminPage.tsx:37` monta `Buscador` con `etiqueta="Buscar por título, número o etiqueta"`, un `<label>` sr-only
    asociado por `htmlFor`. Con texto y sin `exact`, `getByLabel` busca una subcadena sin distinguir mayúsculas, así que
    `getByLabel('Título')` encuentra ese buscador mientras la lista está en pantalla.
  - Las rutas son `lazy` y React Router 7 hace la navegación dentro de una transición. Entre el clic en «Editar» y el commit de
    la ruta nueva, la lista sigue en el DOM y el único campo que coincide es el buscador. Por eso el `fill` cae ahí y el
    guardado manda el título viejo, que es lo que mostró el trace.
  - `abrirEdicion` espera lo que corresponde. En `NormativaFormPage.tsx`, el `<h1>` con «Editar normativa» (línea 143) lo
    dibuja el mismo componente `Formulario` que el campo `#titulo`, y ese componente solo aparece cuando la normativa ya cargó
    (líneas 72-76). El Breadcrumb repite el texto pero no es un heading, y `level: 1` descarta cualquier otro encabezado. Una
    vez visible el encabezado, la lista ya no está montada y `getByLabel('Título')` tiene un solo candidato.
  - La segunda edición (la que reemplaza el PDF) usa `input[type=file]`, que la lista no tiene, así que antes no sufría la
    carrera. Ahora espera de más, sin efecto negativo.
- No se debilitó ningún test: no se quitó ninguna aserción y la única espera nueva es más estricta que antes. No cambió nada
  de la app ni de Supabase.

### Fuera de alcance: la misma carrera en otro spec (para un issue, no se arregla acá)
- `e2e/padron.spec.ts:83-84`: hace clic en «Editar» desde la lista y enseguida llama a
  `page.getByLabel('Localidad').selectOption({ label: 'Apóstoles' })`. La lista (`EstablecimientosPage.tsx:61`) tiene su
  propio `<Label htmlFor="localidad">Localidad</Label>`, que coincide incluso exacto. Si `selectOption` corre antes del commit
  de la ruta de edición, cambia el filtro de la lista (`elegirLocalidad` → `?localidad=5`), y esa navegación puede reemplazar
  a la de edición. Ahí el test falla por timeout al buscar «Guardar cambios», o por modo estricto si las dos coinciden a la
  vez. Es un flake, no un falso verde. El arreglo sería el mismo: esperar el encabezado «Editar establecimiento» antes de
  `selectOption`.
- Los demás `getByLabel('Título')` (`portal.spec.ts:11`, `no-contar-admin.spec.ts:71`, `dashboard.spec.ts:86` y el `alta` de
  `normativas-admin.spec.ts:14`) llegan al formulario con `page.goto('/admin/normativas/nueva')`: la lista nunca se monta y no
  hay carrera. `categorias.spec.ts:35` ya espera el encabezado. `talleres-admin.spec.ts:43` (`Estado`) y
  `padron.spec.ts:70` (`Nombre del establecimiento`) llegan por clic, pero sus listas no tienen ningún label que coincida.
  Los `Nombre` de talleres usan `exact: true` o van dentro del diálogo.

### Sobre la reproducción (punto 4)
No pude correr Playwright: el perfil del revisor bloquea `npx playwright test` (hook `roles.mjs`, perfil checks). Lo que
puedo decir:
- «1 de 15 antes, 30 de 30 después» sostiene poco por sí solo. Si el arreglo no hiciera nada y la falla siguiera en 1 de 15,
  30 corridas verdes seguidas saldrían por azar con una probabilidad de (14/15)^30 ≈ 13 %. Lo que convence es el mecanismo:
  el trace muestra el `fill` en el buscador y el código confirma que el selector es ambiguo justo en esa ventana. Con eso, el
  arreglo elimina la causa y no depende de los tiempos.
- Las dos fallas en `loginAdmin` (`helpers.ts:14`) con la CPU saturada no tienen relación con este cambio: ocurren antes de
  llegar a normativas y dependen del timeout de 5 s del `expect` del Dashboard, que el plan deja fuera de alcance. Es
  coherente con que `timeout` no toque los `expect`.
- `test-results/.last-run.json` dice `passed`, pero no indica qué corrida fue.

## Evidencia
- `npm run lint`: sale con 0. Hay 4 advertencias que ya existían (`react(incompatible-library)` en `DescargaModal.tsx`,
  `ConfiguracionPage.tsx` y `TallerFormPage.tsx`, y `react(only-export-components)` en `AuthContext.tsx`), ninguna en los
  archivos del diff.
- `npm run typecheck` (`tsc -b`, que incluye `e2e/**/*.ts` y `playwright.config.ts` por `tsconfig.node.json`): sale con 0,
  sin errores.
- `npm test`: Test Files 102 passed (102), Tests 1787 passed (1787). Vitest no toma `e2e/`, así que no cubre el cambio.
- `npx playwright test e2e/normativas-admin.spec.ts --retries=0 --repeat-each=5`: no se corrió porque el hook del rol
  revisor lo bloquea. No corrí nada contra la base, así que no hace falta `db:reset`.
