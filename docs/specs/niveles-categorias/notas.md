# Notas de implementación: niveles-categorias

## Desvíos de la spec

- **`nivel_educativo` sin `created_at` ni `updated_at`.** La definición §8.3 dice que todas las tablas los llevan, pero es un catálogo
  fijo que ningún rol de la API escribe: no hay nada que fechar. Lleva el trigger `nivel_educativo_auditar`, así que cualquier cambio hecho
  por migración o Studio queda registrado. Si el catálogo llegara a ser editable, se agregan en una migración nueva.
- **`NoEncontrado.tsx` (nuevo, en `src/pages/admin/talleres/`).** Componente chico que envuelve `EmptyState` con un botón "Volver". Lo usan
  `CategoriasPage`, `CategoriaFormPage`, `TalleresListPage` y `TallerFormPage` para el "no encontrado" del criterio 2, en lugar de repetir el
  bloque cuatro veces. Reemplaza al `<Navigate to="/admin/talleres">` que tenían las pantallas.
- **`ConfirmDialog` acepta `confirmLabel`** (por defecto "Eliminar", así que `NormativasAdminPage` y `TalleresListPage` no cambian).
  `CategoriasPage` pasa "Dar de baja".
- **`NivelesPage` muestra `ErrorFallback` con "Reintentar" si falla la carga de categorías** (no estaba en la spec): sin eso un error se
  veía como "0 categorías" en los cinco niveles.
- **Catálogo público:** `FiltrosState.nivel` pasa a `number | ''` y `TalleresCatalogoPage` filtra los talleres por `categoriaId` dentro de las
  categorías del nivel (puente hasta el corte de talleres, como pide la spec).
- **`AuthContext`:** ver "Ronda de correcciones" (la regla de limpieza quedó en una sola condición).
- **El pgTAP no necesitó correcciones**: el plan de 36 estaba bien contado y pasó a la primera contra la migración
  (después se bajó a 32, ver la ronda de correcciones).
- `src/shared/types/database.ts` queda sin formatear, como lo deja `db:types` y como estaba en `main`.

## Ronda de correcciones (crítica de código y revisión)

Aplicado:
- **Ids de la URL en un solo lugar.** `idDeRuta(param)` (en `types.ts`, junto a `nombreNivel`) devuelve un entero positivo o `null`, y reemplaza
  todos los `Number(...)` sueltos de `:nivelId` y `:categoriaId`. El hook `useCategoriaDeRuta(nivelId, categoriaId)` (sobre `useCategorias`)
  devuelve un estado discriminado: `cargando`, `error` (con `reintentar`), `no-encontrada` (id inválido, inexistente o de otro nivel) u `ok`
  con la categoría. Lo usan `CategoriaFormPage` (al editar), `TalleresListPage` y `TallerFormPage`: ya no hay "Cargando..." infinito y una
  categoría de otro nivel no mezcla breadcrumbs. `useCategoria(id)`, que la spec listaba, se quitó con sus tests (agente principal):
  ninguna pantalla lo usaba después de `useCategoriaDeRuta`, y el corte de talleres lo habría copiado como parte del molde.
  No se pasó a rutas de layout: se evalúa en el corte de talleres, cuando se sume `:tallerId`.
- **`AuthContext`:** una sola regla, `cambio && evento !== 'INITIAL_SESSION'`, y sin el `user &&` redundante. Se quita el desvío anterior
  (limpiar siempre en `SIGNED_OUT`): un `SIGNED_OUT` sin cambio de usuario derivado no tiene nada distinto que limpiar.
- **Migración y pgTAP:** se quitó `categoria_nivel_id_idx` (lo cubre `categoria_nivel_nombre_uniq`, que empieza por `nivel_id`) y los 4 asserts
  que repetían `rls_global` (`has_table` y `relrowsecurity`). Plan de 32. La migración no estaba commiteada, así que se editó.
- **Tests nuevos:** `idDeRuta` (`types.test.ts`), `useCategoriaDeRuta.test.ts`, `NivelesPage.test.tsx` (conteo de activas y error con
  "Reintentar"), `TalleresListPage.test.tsx` y `TallerFormPage.test.tsx` (id inválido, categoría inexistente o de otro nivel, error de carga
  con "Reintentar"), dos casos en `CategoriasPage.test.tsx` (la baja y la reactivación que fallan muestran un alert; ya lo hacía el código) y
  `TalleresCatalogoPage.test.tsx`.
- **Catálogo público:** con un nivel elegido, mientras cargan las categorías se muestra el skeleton y si fallan, el error con "Reintentar"; nunca
  "No encontramos talleres" en esos casos.

Aceptado sin cambios:
- **El admin puede cambiar `nivel_id` por la API directa** (PATCH). Se acepta: el admin es de confianza y la UI no lo envía (`CategoriaCambios` no
  tiene `nivel_id`). Si en el corte de talleres mover una categoría de nivel rompe métricas o reglas, evaluar un trigger o `revoke update (nivel_id)`.

Verificación manual (pasos 2 y 3 de la spec): Joa Sanchez la confirmó el 2026-10-10 con `npm run dev` y Supabase local, sin
detallar cada resultado. Los pasos eran: alta, duplicado normalizado en Secundario (error) y en Primario (pasa), edición, baja y reactivación con sus filas
en `registro_operacion`, y anon → login en la misma pestaña mostrando las inactivas.
