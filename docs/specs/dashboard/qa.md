# QA 1

## Veredicto
Hay bugs (uno menor/importante de layout en celular). La funcionalidad del tablero anda de punta a punta.

## Qué probé
- 3 descargas (PADRON, OTRA, cargo "Otro" sin institución) y 1 de normativa; el admin ve descargas +3, 1 establecimiento alcanzado más, aviso "1 institución sin vincular", serie con +3 hoy, ranking con los 3 talleres (1 cada uno), nivel y cargo suman ~100 % (Docente 66,7 % / Otro 33,3 %; Inicial 100 %, los otros 4 niveles en 0), normativa con 1 y "Total histórico" — pasó
- Rango 2020-01-01..2020-01-31: KPIs en 0, estados vacíos en serie/ranking/nivel/cargo, URL con `periodo=rango&desde&hasta`, recarga la conserva — pasó
- desde > hasta y desde < 2020: alerta junto a los campos (`aria-invalid`), sin skeletons ni secciones — pasó
- Usuario `sin-permiso@dam.local` (token real) y anon llaman `metricas_resumen`: error con `42501` — pasó
- Pantalla de 360 px (captura de página completa revisada): la serie con barras CSS, tablas y aviso se leen bien — pero hay scroll horizontal (bug abajo)

## Bugs
- **[menor]** Scroll horizontal del tablero en celular
  Pasos: 1. Entrar como admin. 2. Viewport 360x740. 3. Ir a `/admin`. · Esperado: sin scroll horizontal. · Obtenido: `scrollWidth` 487 > 360; el `<main className="flex-1 ...">` de `src/shared/components/layout/AdminLayout.tsx` se ensancha (sin `min-w-0`) por una tabla ancha (probablemente "Descargas por localidad", 5 columnas), y el fondo/encabezado quedan más angostos que el contenido. Verificado por `e2e/dashboard.spec.ts` (marcado `test.fail()`; quitarlo al corregir). No confirmé si otras pantallas admin con tablas ancha tienen lo mismo.

## Observaciones
- La serie por día de 30 días son 30 filas en celular (lista larga, sin problema funcional).
- Con `desde` vacío (borrar el campo) no probé el comportamiento.
- Los porcentajes exactos y "Ver todos/Ver todas" (más de 10) no se probaron en e2e (los cubren unit tests); por el mismo motivo el ranking se verificó con lo que había en la base, tolerando datos de otros specs (línea base y deltas).
- Bordes horarios Argentina/UTC: solo pgTAP, no en navegador.
- No vi errores ni avisos de consola relevantes en los escenarios (no se instrumentó la consola de forma sistemática).

## Evidencia
`npm run test:e2e` completo: 31 specs pasan (incluye regresión); `dashboard.spec.ts`: 3 pasan y 1 fallo esperado (`test.fail`, bug de celular). `npm run db:reset` ejecutado al terminar.

## Resolución (ingeniero)
- **Scroll horizontal en celular: corregido.** La causa principal no era el `<main>` sino el grid de `DashboardPage` sin columnas
  en celular: la columna implícita crece hasta el ancho mínimo de la tabla. Se corrigió con `grid-cols-1`, que es `minmax(0, 1fr)`.
  Además:
  - `min-w-0` en el contenedor flex de `AdminLayout`;
  - `overflow-x-auto` en `Seccion`, para que las tablas anchas se desplacen dentro de su tarjeta.
- Se quitó el `test.fail()`. El spec usaba `document`, `window` y un `t` sin tipo, y no compilaba con el `tsconfig` de e2e (fallaban `typecheck` y
  `build`). Se pasó a una expresión en texto y a un tipo explícito.
- Con base vacía, el ancho daba 360 y el bug no aparecía. Solo se reproduce con los datos que dejan otros specs.
- Evidencia: `npm run test:e2e` 31 passed, `npm test` 1172 passed, `typecheck` y `build` ok.
