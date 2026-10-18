# Contexto (Explore) — instituciones sin vincular

## `registro_descarga` (`supabase/migrations/20261010180000_descargas.sql`)
- Columnas (12-21): `id`, `taller_id`, `cargo`, `cargo_otro`, `localidad_id`, `institucion_tipo` (enum `PADRON|OTRA|SIN_INSTITUCION`),
  `establecimiento_id` (FK nullable, sin cascada), `institucion_otra varchar(200)`, `fecha_hora`. Sin `updated_at`.
  Comentario (11): "la vinculacion futura completa establecimiento_id sin borrarlo".
- `registro_descarga_institucion_otra_check` (29-31): `(institucion_tipo = 'OTRA') = (institucion_otra is not null)` y sin espacios en los extremos.
- `institucion_coherente` (33-38): PADRON exige `establecimiento_id`; OTRA admite nulo o no nulo; SIN_INSTITUCION exige nulo.
  Pasar a PADRON obliga a anular `institucion_otra` (23514). Vincular dejando OTRA cumple ambos CHECK (`descargas.test.sql:181-184`).
- RLS (45); `revoke all` a anon y authenticated (47); solo `grant select` a authenticated (48); política única `registro_descarga_select_admin` (51-55).
  Sin grant de UPDATE: `descargas.test.sql:487-489` y `520-522` fijan 42501 "hasta la vinculacion".
- Trigger `auditar()` `after update or delete` (60-62); `tgtype` 24 fijado en `descargas.test.sql:146-150`. El UPDATE de vinculación se audita.
- `registrar_descarga` (74-116; redefinida en `20261016130000_no_contar_admin.sql`): definer, DA003/DA004, anula `establecimiento_id` si no es PADRON; el admin no inserta.

## Métricas y dashboard (`20261016120000_metricas.sql`)
- `metricas_resumen.sin_vincular` (79-83): `count(distinct (localidad_id, lower(inmutable_unaccent(btrim(institucion_otra)))))` con
  `institucion_tipo='OTRA' and establecimiento_id is null`. Sin período (estado actual). Misma normalización que `establecimiento_localidad_nombre_uniq`.
- `metricas_por_localidad` (191-222): `descargas` por `r.localidad_id` declarada (todos los tipos); `alcanzados` = establecimientos activos con id en
  los registros, agrupados por `e.localidad_id` (una OTRA vinculada suma); `padron` = activos de la localidad.
- `metricas_resumen.establecimientos_alcanzados` (77): `count(distinct establecimiento_id)` sin filtrar tipo.
- No existe RPC que liste los grupos.
- Aviso: `src/pages/admin/DashboardPage.tsx:58-62`, `<p>` sin enlace con "{n} institución/instituciones sin vincular". Tests: `DashboardPage.test.tsx:305-332`
  ("sin enlace", línea 310). Spec del dashboard `docs/specs/dashboard/spec.md:22` dice "sin enlace". e2e `dashboard.spec.ts:42-46` lee el número con regex.

## `src/features/establecimientos`
- `consultas.ts`: `obtenerLocalidades`, `obtenerEstablecimientos(localidadId)` (por localidad por el tope de 1000), `obtenerEstablecimiento`,
  `crearEstablecimiento` (insert + select single), `actualizarEstablecimiento`.
- `errores.ts`: `esNombreDuplicado` (`establecimiento_localidad_nombre_uniq`), `esCueDuplicado` (`establecimiento_cue_key`).
- Hooks: `useLocalidades`, `useEstablecimientos(localidadId)`, `useEstablecimiento`, `useCrearEstablecimiento` y `useActualizarEstablecimiento` (invalidan `['establecimientos']`).
- `establecimiento` (`20261010170000_padron.sql:111-162`): índice único `(localidad_id, lower(inmutable_unaccent(btrim(nombre))))` incluye inactivos;
  select `activo or es_admin()`; grant UPDATE por columna; auditar + tocar_updated_at.
- Páginas: `EstablecimientosPage.tsx` (Select de localidad en `?localidad=`, Buscador, tabla a mano, ConfirmDialog); `EstablecimientoFormPage.tsx`
  (zod: nombre ≤200, CUE solo dígitos ≤20; errores de duplicado con `setError`; página completa, sin nombre inicial por URL).

## Rutas y UI
- `src/app/router.tsx:110-120`: rutas de establecimientos con `handle: { title }`.
- `src/shared/components/layout/AdminSidebar.tsx:6-12`: Dashboard, Talleres, Normativas, Establecimientos, Configuración.
- UI: `Dialog` (focus trap, ids fijos), `ConfirmDialog`, `AutocompleteInput` (solo strings, 6 sugerencias), `Buscador`, `Select`, `Input`, `FieldError`,
  `Button`, `Badge`, `EmptyState`, `ErrorFallback`, `TableSkeleton`, `Breadcrumb`. Sin tabla genérica ni combobox con ids.
- `src/shared/lib/texto.ts` `normalizar` (NFD, sin tildes, minúsculas, sin trim): no es idéntica a la SQL.

## Tests
- Guardias globales: `rls_global`, `auditoria_global` (excepción `('registro_descarga', 4)`), `truncate_global`, `updated_at_global`, `storage_global`, `funciones`.
  Ninguna cubre grants por columna ni EXECUTE: se prueban en el test de cada tabla (ej. `descargas.test.sql:272-283`, `padron.test.sql:126-275`).
- `descargas.test.sql`: `plan(98)`; soportes como postgres al principio (43-95); admin con `app_metadata.admin` (511-512).
- e2e: `padron.spec.ts` (alta, duplicados, baja), `dashboard.spec.ts` (descargas OTRA en Posadas, +1 sin vincular).
