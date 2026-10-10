# Contexto: niveles-categorias

Relevamiento de Explore (2026-10-10) sobre `main` en `8f1270b`.

## 1. Tipos actuales (`src/features/talleres/types.ts`)
- L1 `Nivel` = unión de slugs con `'todos'`. L3-10 `NIVELES` {value,label}[] (incluye `'todos'`, L9). L12 `NIVELES_FILTRO` (sin `'todos'`).
  L14 `NIVEL_VALUES` (as const, con `'todos'`, lo usa zod). L16 `nivelLabel(nivel)`.
- L34-39 `Categoria { id: string; nombre; nivel: Nivel; descripcion?: string }`.
- L50-63 `Taller { id: string; categoriaId: string; …; nivel: Nivel (duplicado, L55); …; descargas: number (L61); estado }`.
- `types.test.ts` (L2 importa `NIVELES_FILTRO`, `nivelLabel`, `destinatarioLabel`; L16-20 verifica que no haya `'todos'`).

## 2. Mocks (`src/features/talleres/mocks/`)
- `categorias.mock.ts:3` y `talleres.mock.ts:3` son **arrays vacíos**. No hay mock de niveles: salen de la constante `NIVELES`.
- Solo `useTalleres.test.ts` construye un `Taller` (`categoriaId: 'c1'`).

## 3. Hooks y consumidores
- `hooks/useCategorias.ts`:
  - L11-16 `useCategorias(nivel?)`, key `['categorias', nivel ?? 'all']`. Filtra `c.nivel === nivel || c.nivel === 'todos'` (L8).
  - L18-27 `useCategoria(id)`, key `['categorias', id]`. **Puede colisionar** con la key por nivel.
- `hooks/useTalleres.ts`: L5-9 `TalleresFiltro {categoriaId?, nivel?, destinatario?, busqueda?}`. L15 filtra por `categoriaId`, L16 por `t.nivel`.
- Admin:
  - `NivelesPage.tsx`: L6 `useCategorias()`; L14 `NIVELES_FILTRO`; L15-17 cuenta por nivel con `'todos'`; L21 link `/admin/talleres/${slug}`.
  - `CategoriasPage.tsx`: L46 `useParams<{nivel}>`; L48 `useCategorias(nivel)`; L49 `useTalleres({})` para contar (L54-56).
    L94 `nivelLabel(cat.nivel)`. L97/104 links con `cat.id` y `?editar=`. L109/121-127: la baja **no hace nada**.
  - `CategoriaFormPage.tsx`:
    - L13-17 zod `{nombre min 2, nivel: z.enum(NIVEL_VALUES), descripcion?}`;
    - L26 `useCategoria(editarId)`;
    - L57-60 `onSubmit` **simulado** (setTimeout + navigate).
  - `TalleresListPage.tsx`: L17 params, L22 `useCategoria`, L42 `nivelLabel(categoria.data.nivel)`, links L46/62/92 con `nivel`.
  - `TallerFormPage.tsx`: L24 `nivel: z.enum(NIVEL_VALUES)`; L56 `tallerExistente.data.nivel`; L125-128 select de nivel sin `'todos'`.
- Públicas:
  - `TalleresCatalogoPage.tsx:12-18` `filtros.nivel` → `useTalleres({nivel})`.
  - `TallerFiltros.tsx` (L1/5/24-33): opciones de `NIVELES_FILTRO`.
  - `TallerCard.tsx:17` y `TallerDetallePage.tsx:54`: `nivelLabel(taller.nivel)`.
  - `HomePage.tsx:6,167`: `NIVELES_FILTRO` en un texto sr-only.
- `DashboardPage.tsx:80-83` usa strings de nivel de su propio mock (fuera de alcance).
- Sin tests de `useCategorias` ni de páginas de categorías. `useTalleres.test.ts` (L9-23, L30-33) usa `t.nivel` y `descargas`.

## 4. Router (`src/app/router.tsx:69-92`)
`/admin/talleres` (NivelesPage) · `/admin/talleres/:nivel` (CategoriasPage) · `/admin/talleres/:nivel/nueva-categoria` (CategoriaFormPage, edición con `?editar=<id>`) ·
`/admin/talleres/:nivel/:categoriaId` (TalleresListPage) · `…/nuevo` y `…/:tallerId/editar` (TallerFormPage). `:nivel` es hoy un slug.

## 5. Relación taller → categoría → nivel
Taller → categoría por `categoriaId` (string). El nivel del taller está duplicado en `taller.nivel`. Los mocks vacíos no dejan datos que reconciliar.

## 6. Patrón de `configuracion`
- `types.ts`: `Tables<'configuracion'>` / `TablesUpdate<…>`.
- `consultas.ts`: `if (error) throw error; return data`.
- Hooks: `useQuery` + `useMutation` con `setQueryData`.
- Tests de hooks: `vi.mock('../consultas')` + `renderHook` con `crearQueryClient()` (`src/test/utils.tsx`).

## 7. Supabase
- Migraciones: `…_base.sql`, `…_guardias.sql`, `…_configuracion.sql` (`tocar_updated_at()`, RLS, triggers).
- Guardias para toda tabla nueva de `public`: `rls_global`, `auditoria_global` (trigger `auditar()`), `truncate_global` (por privilegios por defecto) y `updated_at_global` (si tiene `updated_at`).
- **No hay `seed.sql`** (`[db.seed]` apagado). Los 5 niveles van en la migración, como la fila de configuración.
- Definición §8.3:
  - `nivel_educativo(id smallint PK, nombre varchar(50) UNIQUE, orden smallint)`;
  - `categoria(id int PK, nivel_id smallint FK, nombre varchar(150) único normalizado por nivel, descripcion text, activo boolean default true, created_at, updated_at)`.

## 8. Catálogo público
Filtro por nivel → `useTalleres.ts:16` sobre `t.nivel`. No hay navegación pública por categoría. La búsqueda (título y etiquetas) queda fuera.

## Riesgos
- Slug de URL vs id smallint. `Categoria.id` string vs int. `Taller.nivel`/`descargas` se quitan (0008), pero talleres sigue en mock.
- La regla de baja (§5.3: no dar de baja categorías con talleres no inactivos) necesita la tabla `taller`.
- Colisión de queryKeys de categorías.
