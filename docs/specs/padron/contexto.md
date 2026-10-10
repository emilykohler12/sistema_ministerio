# Contexto: corte padrón (localidad, establecimiento)

Relevado por `Explore` (solo lectura). ADR relevantes: 0010 (padrón), 0008, 0012, 0013, 0015, 0017.

## Patrón a copiar: niveles-categorias
- `supabase/migrations/20261010024653_niveles_categorias.sql`:
  - `nivel_educativo` es una tabla fija: `id smallint` explícito, filas insertadas en la migración, sin timestamps. Su única política es `select` para `anon, authenticated` con `using (true)`. Tiene el trigger `auditar()`, porque la guardia lo exige también en las tablas fijas.
  - `categoria`: `id int generated always as identity`, `check (btrim(nombre) <> '')`, `activo` y `created_at`/`updated_at`. Índice único `(nivel_id, lower(public.inmutable_unaccent(btrim(nombre))))` que incluye las inactivas.
  - RLS de `categoria`: `select` con `activo or (select public.es_admin())`; `insert` y `update` solo admin; sin delete.
  - Triggers `<t>_auditar` (after insert/update/delete) y `<t>_tocar_updated_at` (before update).
- Grants de UPDATE por columna: en `..._talleres.sql` L235-236 (`revoke update ...; grant update (cols) ...`). Lo mismo en `recurso` y `normativa`.
- Test: `supabase/tests/niveles_categorias.test.sql`:
  - Bloques por rol (anon, authenticated sin marca, admin) con `set local role` y `request.jwt.claims`.
  - Aserciones: `throws_ok` 42501 y 23505, `results_eq` y `lives_ok`.
  - Un UPDATE o DELETE sin política afecta 0 filas y no da error.

## Guardias globales (`supabase/tests/*_global.test.sql`)
Toda tabla de `public` necesita RLS y el trigger `auditar()`. Toda tabla con `updated_at` necesita `tocar_updated_at()`. El TRUNCATE ya está cubierto por default privileges (`..._guardias.sql`).

## Frontend de referencia
- Categorías:
  - Consultas: `src/features/talleres/consultas.ts` L5-25 (`select/insert/update` con `.select().single()` e `if (error) throw error`).
  - Hook: `hooks/useCategorias.ts`, con la clave `['categorias']` y mutaciones que la invalidan.
  - Errores: `errores.ts` (puro; `esNombreDuplicado` por 23505 y `mensajeDeError`).
- Pantallas de categorías:
  - `CategoriasPage.tsx`:
    - Cargando: `CardSkeleton`. Error: `ErrorFallback onRetry`. Vacío: `EmptyState`.
    - Las inactivas llevan un `Badge` "Inactiva".
    - Dar de baja pasa por un `ConfirmDialog`. Reactivar es una mutación `{activo:true}`.
  - `CategoriaFormPage.tsx`:
    - Validación con zod espejo de la base.
    - Contenedor con estados `cargando`/`error`/`no-encontrada`/`ok`.
    - Un 23505 se convierte en `setError` del campo.
- Lista plana del panel con búsqueda: `src/pages/admin/normativas/NormativasAdminPage.tsx` (`Buscador`, `TableSkeleton`, `ConfirmDialog`).
- UI disponible en `src/shared/components/ui/`: Badge, Breadcrumb, Buscador, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorFallback, FieldError, Input, Label, NoEncontrado, Select, Skeleton, Textarea, ToggleGroup, entre otros.
- Ids de ruta: `src/shared/lib/rutas.ts` (`idDeRuta`).
- Router: `src/app/router.tsx` (imports `lazy` en L12-41; árbol `/admin` en L67-105, con `handle.title`).
- Menú: `src/shared/components/layout/AdminSidebar.tsx` L6-11 (array `links` con un icono de lucide).

## Scripts
- `scripts/seed-usuarios.mjs`:
  - ESM y sin dependencias.
  - Obtiene `API_URL` y `SERVICE_ROLE_KEY` con `npx supabase status -o json`.
  - La guardia `esUrlLocal` aborta si la URL no es local.
  - Es idempotente. Lo invocan `db:start` y `db:reset`.
- No hay tests de scripts ni dependencias de CSV.
- Node v24 ejecuta `.ts` sin compilar.
- La configuración de Vitest no restringe `include`.

## Lo que se toca o se reemplaza
- `src/features/descargas/useNombresInstitucionSugeridos.ts` es un stub (`[]`) "hasta el corte del padrón". Solo lo usa `DescargaModal`, que ninguna pantalla monta. Se reemplaza en el corte descargas.
- En el dashboard (`src/features/dashboard/mocks/dashboard.mock.ts`) los datos de localidad están vacíos (`escuelasAlcanzadas: 0`). No se tocan.
- No hay nada de `localidad` ni `establecimiento` en `supabase/`, `src/` ni `database.ts`.

## Diccionario (`docs/definicion-dam.md` L510-539)
- `localidad(id smallint PK, nombre varchar(100) NOT NULL único normalizado)`.
- `establecimiento(id int PK, cue varchar(20) UNIQUE opcional, nombre varchar(200) NOT NULL, localidad_id smallint FK NOT NULL, activo boolean NOT NULL default true)`.
- `registro_descarga.establecimiento_id` será una FK a `establecimiento` (corte descargas).

## Riesgos detectados
- El diccionario no prevé timestamps. Si se agregan, la guardia exige `tocar_updated_at`.
- El script de importación escribe con service_role: hay que definir cómo corre contra la nube sin romper la regla "nunca producción" para agentes.
- C-08 sigue abierta (formato del CSV).
