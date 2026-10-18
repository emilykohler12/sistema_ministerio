# Revisión 1 — instituciones sin vincular (#19)

## Veredicto
Cambios necesarios (dos puntos importantes y chicos; nada crítico)

La base está bien. `vincular_institucion` es `security definer` con `search_path = ''` y empieza por `es_admin()` → `42501`. Bloquea el
establecimiento con `FOR SHARE` y da `DA005` si no existe, está inactivo o es de otra localidad. Solo toca `establecimiento_id` de las `OTRA`
sin vincular. No hay grant de UPDATE ni política nueva sobre `registro_descarga`, y el pgTAP fija el 42501 del UPDATE directo del admin.
PUBLIC y anon no tienen EXECUTE: hay asserts con `aclexplode` y `has_function_privilege`. La clave del grupo es la misma de
`metricas_resumen.sin_vincular`, y el pgTAP compara los dos conteos antes y después de vincular. `variantes` sale con `coalesce(..., '{}')` y
tiene su assert. La auditoría queda con el `usuario_id` del admin.

En el front, `useFocusTrap` tiene su test de regresión y `useVincular` invalida en `onSettled`, con tests de éxito, 0 y DA005. Los diálogos son
hermanos, ofrecen solo activos y tienen rama de error con test. "Reintentar" solo vincula. El esquema y los mensajes pasaron a `esquema.ts` y
`errores.ts`. `arquitectura.md` está al día: dominio, rutas, migración y brechas.

Lo del incidente con oxfmt: el diff contra `main` solo toca archivos de la feature (más la memoria del crítico). La única diferencia de
espacios es la sangría del `Link` nuevo en `EstablecimientosPage.tsx`. `EstablecimientoFormPage.test.tsx` no cambió y pasa con los mensajes
movidos. En `DashboardPage.test.tsx` se reemplazó el test "sin enlace" por dos con `getByRole('link')` y `href`, que es lo que pide el
criterio 8. No encontré tests debilitados.

## Problemas
- **[importante]** `supabase/migrations/20261018120000_vinculacion.sql:58`: el orden no es el del criterio 1. La spec dice "orden descargas desc,
  localidad, nombre" (y la respuesta 10 de `critica.md`, "las filas desempatan por localidad y nombre"). La migración ordena por
  `g.descargas desc, g.ultima desc, g.localidad_id, g.nombre`, y `arquitectura.md` y el CONTRATO del pgTAP documentan esa versión. Además, ningún
  test distingue entre las dos: en `supabase/tests/vinculacion.test.sql:129-136`, los tres grupos con 1 descarga tienen la misma `ultima`
  (03-04 12:00), así que sacar o dejar `ultima desc` da verde igual. **Arreglo:** decidir cuál vale y alinear la spec (criterio 1) o la
  migración. Después, agregar al pgTAP dos grupos con las mismas descargas y distinta `ultima`, ordenados al revés de lo que daría el desempate
  por localidad y nombre.
- **[importante]** `src/pages/admin/establecimientos/SinVincularPage.tsx:79-86`: el `role="status"` se monta junto con su texto
  (`{resultado && <p role="status">…}`) y `abrir()` lo desmonta en cada apertura. Una región viva que entra al DOM ya con el contenido no se
  anuncia de forma confiable: VoiceOver casi nunca lo hace y NVDA según el navegador. Encima, en el mismo commit el foco salta al `h1`. El
  criterio 9 pide que el resultado "se anuncia en un `role="status"`", y el test (`SinVincularPage.test.tsx:220, 242, 302, 355`) solo comprueba
  que el nodo exista. **Arreglo:** dejar el contenedor `role="status"` siempre montado (vacío y sin estilos cuando no hay mensaje) y cambiar
  solo su texto. Para que un "Ya estaba vinculado" repetido se vuelva a anunciar, alcanza con vaciarlo en `abrir()` como ahora. En el test,
  conseguir el `status` antes de vincular y verificar que es el mismo nodo después.

Menores (no bloquean):
- `vinculacion.test.sql:164-166`: el caso "sin marca" usa E1, que es válido. Si la validación `DA005` corriera antes que `es_admin()`, el test
  seguiría verde. Usar E2 (inactivo) y esperar `42501` fija lo que pide la revisión: "`es_admin()` primero". Falta además un `DA005` con un id
  inexistente.
- `vinculacion.sql:104-107`: `service_role` conserva EXECUTE (solo se revoca a `public, anon`), aunque el diseño dice "EXECUTE solo
  `authenticated`". No es explotable: `es_admin()` da 42501 sin la marca. Es la cuarta vez que pasa en el proyecto: revocar también a
  `service_role` o corregir la redacción.
- `SinVincularPage.test.tsx:158-166`: el test de carga solo comprueba ausencias. Sin el `TableSkeleton` (que no tiene `role`), sigue verde.
  El criterio 7 pide el skeleton: buscarlo por clase o darle `role="status"` y `aria-label="Cargando"`, como `ListSkeleton`.
- `SinVincularPage.test.tsx:199-210` ("el foco no salta") pasa también sin el arreglo de `useFocusTrap`: la búsqueda vive en `DialogoVincular`
  y la página no se vuelve a renderizar al escribir. El bug lo cubre `useFocusTrap.test.ts:34-46`, así que alcanza con aclararlo en el
  comentario del test.
- `supabase/tests/descargas.test.sql:522` todavía dice "(hasta la vinculacion)". La crítica, en el punto 2, preveía cambiar ese comentario.

Criterios: 1 (salvo el orden), 2 a 8 y 9 (salvo el anuncio) están implementados y tienen test. El "alcanzados +1" del criterio 2 queda cubierto
por `metricas.test.sql:221-223`, porque una `OTRA` con `establecimiento_id` cuenta como alcanzada. La verificación de punta a punta queda para el
`qa`.

## Evidencia
- `npm run lint`: 0 errores, 4 warnings que ya existían en archivos ajenos a la feature (`TallerFormPage`, `ConfiguracionPage`, `DescargaModal`,
  `AuthContext`).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 73 archivos, 1227 tests, todos pasan.
- `npm run db:reset` seguido de `npm run test:db`: 19 archivos, 637 tests, `Result: PASS` (incluye `vinculacion.test.sql` con plan(34)).
