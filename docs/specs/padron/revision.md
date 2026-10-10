# Revisión 1 — padrón fase A

Revisor, 2026-10-10. Rama `feat/padron`. Revisé `git diff main` y los archivos sin trackear: migración, pgTAP, `src/features/establecimientos/**`,
`src/pages/admin/establecimientos/**`, router, sidebar, `database.ts` y `arquitectura.md`. Leí `spec.md`, `notas.md` y `critica.md`.

## Veredicto
**Aprobado.** No hay bloqueantes. Queda un pendiente importante antes del PR: la verificación en el navegador. Los menores se pueden dejar para otro corte.

## Criterios de aceptación

| # | Implementado | Evidencia |
|---|---|---|
| 1 | Sí. Las 79 localidades coinciden exactamente con `localidades.md` (nombre e id del 1 al 79 en orden; lo comprobé con un diff línea por línea). Sin políticas de escritura | pgTAP 1-7, 11-12, 15-16, 19-20, 24, 27-28 (anon, sin marca y admin) |
| 2 | Sí. Select `activo or es_admin()`; INSERT → 42501; UPDATE anon → 42501 (revoke), sin marca → 0 filas | pgTAP 8-10, 13-14, 17-18, 21-23 |
| 3 | Sí. El índice de expresión toma también los inactivos; `errores.ts` busca `"establecimiento_localidad_nombre_uniq"` | pgTAP 32-38 (mensaje exacto); FormPage: alta y edición |
| 4 | Sí, `"establecimiento_cue_key"` | pgTAP 39-40; FormPage: alta y edición |
| 5 | Sí. zod `trim` + `^[0-9]*$` + `''→null`; CHECK `^[0-9]{1,20}$` | pgTAP 41-44; FormPage (CUE con letra, CUE vacío → `null`) |
| 6 | Sí | FormPage: 23505 de otra constraint y `Error` de red → mensaje general |
| 7 | Sí: listado, "Inactivo", búsqueda sin tildes por nombre o CUE, alta, edición, baja con `ConfirmDialog`, reactivar | `EstablecimientosPage.test`, `filtrar.test` |
| 8 | Sí | `EstablecimientosPage.test` (pedido de localidad, estado vacío con enlace que lleva `?localidad=`) |
| 9 | Sí. `navigate(volver(valores.localidad_id))` | FormPage: la edición con cambio de localidad vuelve a `?localidad=3` |
| 10 | Sí, salvo un caso borde (menor 1) | FormPage: `999`, `abc`, `0` |

Seguridad (comprobado con psql sobre la base local):
- RLS activada en las dos tablas.
- `establecimiento`: sin UPDATE de tabla para anon ni authenticated. Grant de UPDATE por columna solo a `authenticated` sobre `cue, nombre, localidad_id, activo`.
- Triggers `auditar()` en las dos tablas y `tocar_updated_at()` en `establecimiento`.
- `localidad` tiene los mismos privilegios de tabla que `nivel_educativo` y `destinatario`: no tiene políticas de escritura, así que la RLS cierra todo.
- La secuencia `establecimiento_id_seq` queda con `rwU`, igual que en `categoria`. No se puede explotar (`generated always`).
- `database.ts` coincide con `supabase gen types --local`, salvo espacios.
- No encontré secretos.

Desvíos de `notas.md` (tests 44 y 49, que esperan `22001` y `428C9`): son correctos. Las dos barreras existen y Postgres responde así antes de llegar al CHECK y al grant.

## Problemas

### Bloqueantes
Ninguno.

### Importantes
- **`docs/specs/padron/notas.md`** — La verificación de punta a punta en el navegador (pasos 2 a 5 de la spec) no figura en `notas.md`, ni hecha ni pendiente. Son 7 cortes
  seguidos con el mismo hueco.
  - Propuesta: hacer los pasos 2 a 5 con `npm run dev` antes del PR: pedido de localidad, vacío de Posadas, búsqueda sin tildes y por CUE, duplicados al crear y al editar, cambio de localidad y baja/reactivación con anon en otra pestaña.
  - Anotar el resultado en `notas.md`, o anotarlo explícitamente como pendiente.

### Menores
1. **`src/pages/admin/establecimientos/EstablecimientoFormPage.tsx:55` y `:62`** (`src/shared/lib/rutas.ts:2-5`) — El criterio 10 falla con un id fuera del rango de `int`.
   - Qué pasa: `idDeRuta` acepta cualquier entero seguro. Con `/admin/establecimientos/99999999999/editar`, PostgREST responde `400 22003` (lo comprobé por REST) y la página muestra `ErrorFallback` con "Reintentar", en lugar de "no encontrado".
   - En el listado (`EstablecimientosPage.tsx:29-32`) pasa algo parecido: `?localidad=40000` dispara una consulta que da `22003` (`smallint`) mientras cargan las localidades. Es solo un parpadeo, porque después se descarta.
   - El patrón es compartido con las otras pantallas que usan `idDeRuta`.
   - Propuesta: acotar el id al rango de `int4` (≤ 2147483647) en `idDeRuta`, o usar una variante para cada columna. En el listado, no consultar hasta que `localidades.isSuccess`.
2. **`supabase/tests/padron.test.sql:17-25`** — El pgTAP fija la cantidad de localidades, los ids 1 y 79 y "Dos Hermanas", pero no los 79 nombres. Hoy coinciden, porque lo verifiqué a mano, pero un error de tipeo en una migración futura no lo detectaría ningún test, y la fase B y el formulario de descarga van a comparar contra esos nombres.
   - Propuesta: un `results_eq('select id, nombre::text from localidad order by id', $$values (1,'25 de Mayo'), …$$)` con las 79 filas, como hace `nivel_educativo` con sus filas.
3. **Ramas de error sin test.** La rama `localidades.isError` está implementada pero no tiene test en ninguna de las dos pantallas:
   - `EstablecimientoFormPage.tsx:62-71`: el test solo hace fallar `obtenerEstablecimiento`.
   - `EstablecimientosPage.tsx:75`.

   Tampoco hay test de un `?localidad=` con un id que no existe en la lista (`EstablecimientosPage.tsx:30-31`; solo se prueba `abc`).
   - Propuesta: un test por rama con `mockRejectedValueOnce` en `obtenerLocalidades` y uno con `?localidad=99`.

Revisé el alcance: no hay cambios fuera de la spec. No se tocaron el script de carga, `registro_descarga` ni `useNombresInstitucionSugeridos`.

## Evidencia
- `npm run lint`: exit 0. 4 warnings previos en otros archivos (`AuthContext`, `DescargaModal`, `TallerFormPage`, `ConfiguracionPage`) y 0 errores. Ningún warning en archivos del corte.
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: **567 passed (567)**. Los del corte (`npx vitest run src/features/establecimientos src/pages/admin/establecimientos`): 5 archivos, 61 tests passed.
- `npm run test:db` (Supabase local): `Files=16, Tests=448`, `All tests successful`, `padron.test.sql .. ok`, guardias globales `ok`. La base quedó con 0 establecimientos (solo hice lecturas por REST).
- `npm run build`: `✓ built in 3.19s`.
- Localidades: `diff` entre la lista de `localidades.md` (numerada en orden) y los `values` de la migración → sin diferencias en las 79 filas.
