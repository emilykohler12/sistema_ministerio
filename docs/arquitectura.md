# Arquitectura del sistema

Mapa breve del DAM: **cómo está el código hoy**. El qué está en `docs/definicion-dam.md` (v2) y el
por qué en `docs/decisiones/`. Actualizarlo al cerrar una feature que cambie la estructura.

## Capas

```
pages/ (pantallas)  →  features/<dominio>/hooks (React Query)  →  mocks hoy · Supabase directo mañana
        ↓
shared/components/ui  (UI base reutilizable)
```

Destino (0012): `pages → hooks → features/<dominio>/consultas.ts → supabase-js`, con `types.ts` derivado
de `src/shared/types/database.ts` (generado). Se migra un dominio por vez.

Destino (decisión 0004): sin API propia. Los hooks llaman a Supabase con supabase-js y RLS protege
los datos. Solo la descarga de talleres (y luego la gestión de usuarios) pasa por Edge Functions.

## Dominios (`src/features/`)

| Dominio | Qué contiene |
|---|---|
| `talleres` | Niveles, categorías, talleres y sus destinatarios y etiquetas. Catálogo público y gestión admin. **Niveles, categorías y talleres migrados a Supabase** (0012; cortes 2 y 3): `types.ts` derivado (`NIVELES` y `DESTINATARIOS` son constantes con las filas fijas de la base, sin hook; `Taller` = fila + `categoria.nivel_id` + destinatarios + etiquetas), `consultas.ts` (solo supabase; talleres con embeds y escritura con la RPC `guardar_taller`), `errores.ts` y `filtrar.ts` (puros, sin imports de supabase: `DA001`/`DA002`, normalización y filtros del catálogo) y hooks sobre las claves únicas `['categorias']` y `['talleres']`. El portal lee solo publicados (`useCatalogo`, `useTallerPublicado`); el panel, todos (`useTalleres`, `useTaller`). Recursos (archivos, Storage, descarga) pendientes |
| `normativas` | Normativas con número, año, etiquetas y archivo |
| `descargas` | Modal de descarga. Hoy: escuela, localidad y rol, sin pantalla que lo use hasta el corte de recursos (el detalle del taller ya no lo abre); `useNombresInstitucionSugeridos` vive aquí. Destino (0010): cargo, localidad, institución del padrón |
| `dashboard` | KPIs y métricas para el administrador |
| `configuracion` | Datos institucionales del sitio. **Migrado a Supabase** (primer corte, 0012): `types.ts` derivado, `consultas.ts`, hooks delgados; sin mocks. Logo pendiente (Storage) |
| `auth` | Sesión del administrador con Supabase Auth (0005). `AuthContext` escucha solo `onAuthStateChange`; `esAdmin.ts` (puro, solo UX) exige `app_metadata.admin`; sesión en `sessionStorage`. Limpia la caché de React Query cuando cambia el usuario derivado (anon/admin), porque la RLS hace que los datos dependan del rol |

## Rutas

- Públicas: `/`, `/talleres`, `/talleres/:id`, `/normativas`, `/contacto`
- Admin: `/admin/login`, `/admin` (dashboard), `/admin/normativas`, `/admin/configuracion` y el árbol de talleres, con ids numéricos
  (un id inválido o inexistente muestra "no encontrado"):
  `/admin/talleres` (niveles) → `/admin/talleres/:nivelId` (categorías) → `/admin/talleres/:nivelId/:categoriaId` (talleres), más
  `/admin/talleres/:nivelId/nueva-categoria` (alta; edición con `?editar=<id>`) y `.../:categoriaId/nuevo` y `.../:tallerId/editar`

## Entorno

Todo el desarrollo corre en el Dev Container (`.devcontainer/`, decisión 0003): Node, dependencias,
tests (Vitest + jsdom + Testing Library, setup en `src/test/`), hooks y Claude Code.
Supabase local corre con Docker-in-Docker (0011): `npm run db:start`, `db:reset` (migraciones + seed de
usuarios con `scripts/seed-usuarios.mjs`), `test:db` (pgTAP en `supabase/tests/`) y `db:types`
(genera `src/shared/types/database.ts`, no se edita a mano).

## Base de datos (`supabase/`)

- `migrations/<ts>_base.sql`: piezas transversales, sin tablas de dominio. `es_admin()` (lee
  `app_metadata` del JWT), `inmutable_unaccent()` para búsquedas sin tildes, `registro_operacion`
  (append-only, solo SELECT para el admin) y el trigger `auditar()`, que falla cerrada.
- `migrations/<ts>_configuracion.sql`: `tocar_updated_at()` (transversal, `before update`, para toda tabla con
  `updated_at`) y la tabla `configuracion` de una fila (`CHECK id = 1`): select público, update solo `es_admin()`,
  sin insert ni delete.
- `migrations/<ts>_niveles_categorias.sql`: `nivel_educativo` (5 filas fijas de 0008 con ids 1-5, solo SELECT, sin timestamps) y `categoria`
  (baja lógica con `activo`; nombre único por nivel sin distinguir mayúsculas, tildes ni espacios, también contra las inactivas;
  select `activo or es_admin()`, insert/update solo admin, sin delete).
- `migrations/<ts>_talleres.sql`: enum `estado_taller`, `taller` (RLS: select `PUBLICADO` o admin; sin delete), `destinatario` (5 filas fijas,
  solo SELECT), `etiqueta` (select público, nombre único normalizado) y los puentes `taller_destinatario` y `taller_etiqueta` (heredan la
  visibilidad de `taller`). La RPC `guardar_taller` (security invoker, solo `authenticated`) guarda taller, destinatarios y etiquetas en
  una transacción. Dos triggers sostienen el invariante "una categoría inactiva solo tiene talleres inactivos": `DA001` al dar de baja
  una categoría con talleres en borrador o publicados (cantidad en `details`) y `DA002` al crear, publicar, reactivar o mover un taller
  a una categoría inactiva. `categoria.nivel_id` ya no se puede modificar (grant de UPDATE por columna).
- Cada corte de dominio agrega su migración, sus tablas con RLS, el trigger `auditar()`, el trigger
  `tocar_updated_at()` si la tabla tiene `updated_at`, y sus tests. Las guardias globales de `supabase/tests/`
  (`rls_global`, `auditoria_global`, `truncate_global`, `updated_at_global`) fallan si se olvida alguno.

## Brechas entre el código y la definición v2

- Integrar Supabase: la base transversal, el cliente (`src/shared/lib/supabase.ts`, variables `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`) y el login real están listos; faltan las tablas de normativas, recursos y padrón, Storage y la
  Edge Function `descargar-taller` (0004–0006). Recuperación de contraseña y cierre por inactividad (§5.2) pendientes.
- Recursos: id, ruta/url, tamaño, orden, tipos PPTX/DOCX/ENLACE y límite de 50 MB (0009).
- Formulario de descarga y modal con lista de enlaces (0006, 0010).
- Nuevas pantallas: establecimientos, instituciones sin vincular, historial; luego usuarios.
- Búsqueda: en talleres ya incluye la descripción e ignora tildes (`filtrar.ts`); falta en normativas. Mejoras del dashboard (definición §5.4).
