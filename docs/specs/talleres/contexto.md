# Contexto: talleres

Relevamiento de solo lectura (Explore, 2026-10-10) antes de la spec. Rutas relativas a la raíz del repo.

## 1. Tipo `Taller` v1 y consumidores

`src/features/talleres/types.ts`:
- `Destinatario` (unión de 5 strings), `DESTINATARIOS` (`{value,label}`), `destinatarioLabel`, `TipoRecurso` ('pdf' | 'video' | 'imagen'),
  `RecursoArchivo`, `EstadoTaller` ('borrador' | 'publicado' | 'inactivo').
- `Taller`: `id: string`, `categoriaId: number`, `titulo`, `descripcion`, `destinatarios`, `etiquetas: string[]`, `fecha`, `responsable`,
  `recursos`, `descargas`, `estado`.
- Ya migrado en el mismo archivo: `NIVELES`, `nombreNivel`, `idDeRuta`, `Categoria*`.

Consumidores:
- `features/talleres/hooks/useTalleres.ts`: filtra por `categoriaId`, `destinatarios`, `titulo` y `etiquetas`; `useEtiquetasSugeridas` sale del mock.
  El mock (`mocks/talleres.mock.ts`) está **vacío** (`Taller[] = []`).
- `features/talleres/components/TallerCard.tsx`: `recursos[0].tipo`, `titulo`, `destinatarios.slice(0,1)`, `fecha`.
- `features/talleres/components/TallerFiltros.tsx`: `DESTINATARIOS`, `NIVELES`; estado `{nivel: number|'', destinatario}`.
- `features/talleres/components/TallerBuscador.tsx`: input "Buscar por nombre o etiqueta".
- `pages/admin/talleres/TalleresListPage.tsx`: `t.id` string en `key` y ruta `/${t.id}/editar`; columnas `titulo`, destinatarios, `fecha`,
  `recursos.length`, `descargas`. "Eliminar" es un stub (solo cierra el diálogo).
- `pages/admin/talleres/TallerFormPage.tsx`: zod `titulo`, `descripcion`, `destinatarios` (min 1), `etiquetas`, `fecha`. Sin campo `estado`
  (botón "Publicar"). `onSubmit` es un stub con `setTimeout`. `ToggleGroup` para destinatarios, `TagInput` con `useEtiquetasSugeridas`,
  `FileDropzone` solo UI. "Responsable" = email del usuario, deshabilitado y no persistido. La categoría sale de la ruta.
- `pages/admin/talleres/CategoriasPage.tsx`: `useTalleres({})` y cuenta talleres por `categoriaId` sin mirar el estado.
- `pages/public/TalleresCatalogoPage.tsx`: búsqueda y destinatario en el hook; nivel en cliente con `categoriasDelNivel` ("puente hasta el
  corte de talleres").
- `pages/public/TallerDetallePage.tsx`: `useTaller(id string)`, similares con `useTalleres({categoriaId})`, `recursos[0]` para tipo y vista
  previa; `DescargaModal` solo se renderiza si hay recurso principal.
- `pages/public/HomePage.tsx`: `useTalleres({})`, slices 0-3 y 3-6, sin orden ni filtro de publicados.
- `features/descargas/DescargaModal.tsx`: importa `useNombresInstitucionSugeridos` de `talleres/hooks/useTalleres` (stub `[]`, es de `descargas`).
- Dashboard y normativas no importan `Taller`.

## 2. Hooks

- `useTalleres(filtro)`: clave `['talleres', filtro]`, latencia simulada, búsqueda `toLowerCase().includes` sobre `titulo` y `etiquetas`
  (no ignora tildes ni mira la descripción, que §5.1 exige). `useTaller(id: string)`: clave `['talleres','detalle',id]`. Sin mutaciones.
- Molde migrado (categorías): clave única `['categorias']` + `select`; `consultas.ts` con `if (error) throw error` y `.select().single()`
  en las escrituras; `errores.ts` puro (`esNombreDuplicado` = `23505`); `useCategoriaDeRuta` con estado discriminado.
- Tests de pantallas: `vi.mock('@/features/talleres/consultas', () => ({...}))`. Las factories actuales solo exportan funciones de categorías:
  hay que sumar las de talleres o fallan con "no export".

## 3. Rutas
`src/app/router.tsx`: públicas `/talleres`, `/talleres/:id`; admin `talleres/:nivelId/:categoriaId/nuevo` y `.../:tallerId/editar`.
`:id` y `:tallerId` hoy son strings; con ids numéricos usar `idDeRuta` y `NoEncontrado.tsx`.

## 4. Base de datos
- `migrations/20261010024653_niveles_categorias.sql`: molde de tabla (identity, `check (btrim(nombre) <> '')`, índice único
  `lower(public.inmutable_unaccent(btrim(nombre)))`, RLS select/insert/update, `<tabla>_auditar`, `<tabla>_tocar_updated_at`).
- `guardias.sql` revoca TRUNCATE por defecto en tablas nuevas.
- Sin `supabase/seed.sql` (`[db.seed] sql_paths = []`); usuarios con `scripts/seed-usuarios.mjs` (`admin@dam.local`, `sin-permiso@dam.local`).
- `auditar()` (`base.sql:76`): `security definer`, guarda `auth.uid()`, `tg_op`, tabla y `to_jsonb(coalesce(new, old)) ->> 'id'` como
  `registro_id`. En tablas puente (PK compuesta) `registro_id` queda nulo; `datos_anteriores`/`datos_nuevos` tienen `taller_id`.
- pgTAP: `begin; plan(N); ...; finish(); rollback;`. Roles con `set local role` + `request.jwt.claims` (`app_metadata.admin` para el admin).
  INSERT sin permiso → `42501`; UPDATE/DELETE sin permiso → 0 filas. Guardias globales: `rls_global`, `auditoria_global` (las tablas puente
  también necesitan `auditar`), `truncate_global`, `updated_at_global`.

## 5. Normativas y etiquetas
`Normativa` es manual (`etiquetas: string[]`). `NormativaFormPage` usa `TagInput`; sus sugerencias hoy salen de talleres.
Normativas sigue en mock hasta su corte, que suma `normativa_etiqueta`.

## 6. Dashboard
Todo mock, sin referencia a `Taller`. Sin impacto.

## 7. Riesgos
1. El modelo `taller` de la definición no tiene `fecha`, `responsable` ni `descargas`.
2. id string → int en rutas, keys y enlaces.
3. Sin `recursos`, `TallerCard`, `TallerDetallePage` y `DescargaModal` pierden su dependencia de `recursos[0]`.
4. `Destinatario` pasa de unión a tabla; cambian filtros, form y tests.
5. Etiquetas: unicidad normalizada, alta al vuelo, sincronización de tablas puente.
6. Reglas diferidas taller↔categoría (triggers, SQLSTATE propio); `CategoriasPage` debe contar por estado.
7. Visibilidad de tablas puente y `etiqueta` para anon.
8. Claves de React Query (0014: sin rol en la clave).
9. Tests a reescribir (`useTalleres.test.ts`, factories de `consultas`).
10. `useNombresInstitucionSugeridos` sin dueño.
