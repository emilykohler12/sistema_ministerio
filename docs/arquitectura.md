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
| `talleres` | Niveles, categorías, talleres y sus destinatarios y etiquetas. Catálogo público y gestión admin. **Niveles, categorías y talleres migrados a Supabase** (0012; cortes 2 y 3): `types.ts` derivado (`NIVELES` y `DESTINATARIOS` son constantes con las filas fijas de la base, sin hook; `Taller` = fila + `categoria.nivel_id` + destinatarios + etiquetas + recursos), `consultas.ts` (solo supabase; talleres con embeds y escritura con la RPC `guardar_taller`), `errores.ts` y `filtrar.ts` (puros, sin imports de supabase: `DA001`/`DA002`, normalización y filtros del catálogo) y hooks sobre las claves únicas `['categorias']` y `['talleres']`. El portal lee solo publicados (`useCatalogo`, `useTallerPublicado`); el panel, todos (`useTalleres`, `useTaller`). Los recursos viajan embebidos en el taller (`recurso: Recurso[]`, ordenados por `orden`, `id`); `CLAVE_TALLERES` se exporta para que `recursos` invalide la caché |
| `recursos` | Archivos y enlaces de los talleres, con el bucket privado `talleres` de Storage. **Migrado a Supabase** (0012; corte 4): `types.ts` derivado (`Recurso`, `TipoRecurso`, `ETIQUETA_TIPO_RECURSO`), `archivos.ts` (puro: tabla `FORMATOS` extensión → tipo y MIME, que fija el tipo y el MIME por la extensión y no por `file.type`; `validarArchivo`, `rutaNueva`, `idDeYoutube`, `formatearTamanio`), `consultas.ts` (solo supabase: Storage, tabla y RPC `ordenar_recursos`), `secuencias.ts` (alta, reemplazo y eliminación con el orden y las compensaciones entre base y Storage), `errores.ts` (413/415 de Storage) y hooks de mutación que invalidan `CLAVE_TALLERES`. La lectura no tiene hook propio: sale de `useTaller` / `useTallerPublicado`. `components/ListaRecursos` es la sección del portal (YouTube integrado con `youtube-nocookie.com`, otros enlaces externos). Sin descarga pública (corte descargas) |
| `normativas` | Normativas con número, año, etiquetas y un PDF en el bucket **público** `normativas`. **Migrado a Supabase** (0012; corte normativas): `types.ts` derivado (`Normativa` = fila + `etiqueta: Etiqueta[]` + `url` pública), `archivos.ts` (puro: `validarPdf`, tope de 20 MiB, `rutaNueva()` = `<uuid>.pdf`), `consultas.ts` (solo supabase: `getPublicUrl`, RPC `guardar_normativa` y `contar_descarga_normativa`), `secuencias.ts` (alta, reemplazo con la `ruta_anterior` que devuelve la RPC y baja, según 0016), `errores.ts` (23505, 413 y 415), `filtrar.ts` (título, número, descripción y etiquetas, sin tildes; orden año desc e `id` desc) y hooks sobre `['normativas']`. `useContarDescarga` cuenta una vez por normativa en la visita (`sessionStorage`), sin esperar la respuesta. `components/EnlaceDescarga` abre el PDF en otra pestaña |
| `etiquetas` | Catálogo compartido por talleres y normativas: `types.ts`, `consultas.ts` (lee la tabla `etiqueta`) y `useEtiquetas` (`['etiquetas']`), que alimenta las sugerencias de ambos formularios. Los guardados de taller y de normativa invalidan esa clave |
| `descargas` | Modal de descarga. Hoy: escuela, localidad y rol, sin pantalla que lo use hasta el corte descargas (el detalle del taller ya no lo abre); `useNombresInstitucionSugeridos` vive aquí. Destino (0010): cargo, localidad, institución del padrón |
| `establecimientos` | Padrón de escuelas por localidad. **Fase A migrada a Supabase** (0010, 0012; corte padrón): `types.ts` derivado (`Localidad` = fila, 79 municipios; `Establecimiento` = fila; `DatosEstablecimiento`, `CambiosEstablecimiento`), `consultas.ts` (solo supabase; los establecimientos se piden por localidad por el tope de 1000 filas de PostgREST), `errores.ts` (puro: distingue `esCueDuplicado` de `esNombreDuplicado` por el nombre de la constraint dentro de `message`, porque PostgREST no expone `constraint_name`), `filtrar.ts` (nombre o CUE, sin tildes) y hooks: `useLocalidades` (`['localidades']`, `staleTime: Infinity`), `useEstablecimientos(localidadId)` (`['establecimientos', id]`), `useEstablecimiento(id)` (`['establecimientos', 'detalle', id]`) y mutaciones que invalidan `['establecimientos']`. El panel (`pages/admin/establecimientos`) elige la localidad por `?localidad=<id>`. Sin carga masiva (fase B) ni consumo público todavía |
| `dashboard` | KPIs y métricas para el administrador |
| `configuracion` | Datos institucionales del sitio. **Migrado a Supabase** (primer corte, 0012): `types.ts` derivado, `consultas.ts`, hooks delgados; sin mocks. Logo pendiente (Storage) |
| `auth` | Sesión del administrador con Supabase Auth (0005). `AuthContext` escucha solo `onAuthStateChange`; `esAdmin.ts` (puro, solo UX) exige `app_metadata.admin`; sesión en `sessionStorage`. Limpia la caché de React Query cuando cambia el usuario derivado (anon/admin), porque la RLS hace que los datos dependan del rol |

## Rutas

- Públicas: `/`, `/talleres`, `/talleres/:id`, `/normativas`, `/contacto`
- Admin: `/admin/login`, `/admin` (dashboard), `/admin/normativas`, `/admin/configuracion`, `/admin/establecimientos` (`?localidad=<id>`), `/admin/establecimientos/nuevo`, `/admin/establecimientos/:id/editar` y el árbol de talleres, con ids numéricos
  (un id inválido o inexistente muestra "no encontrado"):
  `/admin/talleres` (niveles) → `/admin/talleres/:nivelId` (categorías) → `/admin/talleres/:nivelId/:categoriaId` (talleres), más
  `/admin/talleres/:nivelId/nueva-categoria` (alta; edición con `?editar=<id>`) y `.../:categoriaId/nuevo`, `.../:tallerId/editar` y
  `.../:tallerId/recursos` (`RecursosPage`; tras el alta de un taller se navega aquí)

## Entorno

Todo el desarrollo corre en el Dev Container (`.devcontainer/`, decisión 0003): Node, dependencias,
tests (Vitest + jsdom + Testing Library, setup en `src/test/`), hooks y Claude Code.
Supabase local corre con Docker-in-Docker (0011): `npm run db:start`, `db:reset` (migraciones + seed de
usuarios con `scripts/seed-usuarios.mjs`), `test:db` (pgTAP en `supabase/tests/`) y `db:types`
(genera `src/shared/types/database.ts`, no se edita a mano).
Carga del padrón (0019): `npm run padron:importar -- <csv> [--aplicar]` (`scripts/importar-padron.ts`). Sin `--aplicar` simula. Lee el CSV
(`scripts/padron/csv.ts`), arma el plan puro (`planificar.ts`: altas, cambios y rechazos por fila; `equivalencias.ts` para localidades) y escribe con
service_role. Por defecto apunta al Supabase local; un destino remoto exige `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `--confirmar=<host>`
(`scripts/lib/entorno.ts`, que también usa `seed-usuarios.mjs`), y `proteger-bash` lo bloquea para los agentes. Los scripts en TypeScript corren con
`node` directo (type stripping de Node 24) y `tsconfig.node.json` los tipa.

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
- `migrations/<ts>_recursos.sql`: enum `tipo_recurso` (0015) y `recurso` (FK a `taller` sin cascada, CHECK archivo xor enlace, `https://`,
  `tamanio_bytes > 0` y ruta bajo `<taller_id>/`; RLS: select hereda de `taller`, escritura solo admin; `taller_id` inmutable por grant de UPDATE por
  columna). RPC `ordenar_recursos(p_taller_id, p_ids)` (invoker, lista completa, audita solo filas cambiadas). Bucket privado `talleres` por
  migración (50 MiB; PDF, PPTX, DOCX, JPG, PNG, WebP, MP4) y políticas de `storage.objects` solo para el admin (select, insert, delete; sin update).
  Sin trigger que lea `storage.objects`: el invariante "ninguna fila apunta a un archivo inexistente" lo sostiene el orden de las operaciones de la app.
- `migrations/<ts>_resolver_etiquetas.sql`: `resolver_etiquetas(text[]) returns int[]` (invoker, solo `authenticated`) normaliza, crea las
  etiquetas que faltan y devuelve sus ids. La usan `guardar_taller` (reescrita) y `guardar_normativa`.
- `migrations/<ts>_normativas.sql`: `normativa` (número y año únicos sin distinguir mayúsculas, tildes ni espacios de los extremos; `ruta_archivo`
  `<uuid>.pdf` única; baja física; `descargas` sin grant de UPDATE) y `normativa_etiqueta`. Select público, escritura solo admin. Los triggers de
  update (`auditar()` y `tocar_updated_at()`) llevan un `WHEN` que omite el UPDATE que solo cambia el contador. RPC `guardar_normativa` (invoker,
  devuelve `id` y `ruta_anterior` solo si se reemplazó el archivo) y `contar_descarga_normativa` (security definer, `anon`). Bucket público
  `normativas` (20 MiB, solo PDF) con escritura solo del admin.
- `migrations/<ts>_padron.sql`: `localidad` (79 municipios de `docs/specs/padron/localidades.md` con ids 1-79 en orden alfabético, nombre único normalizado, sin timestamps,
  solo SELECT) y `establecimiento` (baja lógica con `activo`; `cue` opcional con `establecimiento_cue_key` y CHECK de solo dígitos; nombre único por localidad sin distinguir
  mayúsculas, tildes ni espacios con el índice `establecimiento_localidad_nombre_uniq`, también contra los inactivos; select `activo or es_admin()`, insert/update solo admin,
  sin delete; grant de UPDATE por columna sobre `(cue, nombre, localidad_id, activo)`). Los nombres de la constraint y del índice son contrato con `errores.ts`.
- Cada corte de dominio agrega su migración, sus tablas con RLS, el trigger `auditar()`, el trigger
  `tocar_updated_at()` si la tabla tiene `updated_at`, y sus tests. Las guardias globales de `supabase/tests/`
  (`rls_global`, `auditoria_global`, `truncate_global`, `updated_at_global`) fallan si se olvida alguno. `storage_global` exige que toda
  política de escritura de `storage.objects` sea de `authenticated` con `es_admin`.
- Storage desde el frontend: `src/shared/lib/storage.ts` (`subirArchivo` y `borrarArchivo` por bucket, `compensar` y `borrarOAvisar` de 0016).
  Cada dominio lo envuelve en su `consultas.ts` y ordena las operaciones en su `secuencias.ts`.

## Brechas entre el código y la definición v2

- Integrar Supabase: la base transversal, el cliente (`src/shared/lib/supabase.ts`, variables `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`) y el login real están listos; falta la carga real del padrón con la muestra (C-08: el script ya existe, ver Entorno; faltan sus columnas, las equivalencias de localidad y correrlo contra la nube), el bucket del logo y la
  Edge Function `descargar-taller` (0004–0006). Recuperación de contraseña y cierre por inactividad (§5.2) pendientes.
- Recursos: faltan la descarga (enlaces firmados públicos, Edge Function) y el registro de descargas. Limpieza de archivos huérfanos en Storage
  (hoy solo un `console.warn`; vale también para normativas), subida reanudable (TUS) y barra de progreso. La baja y el reemplazo de un recurso
  borran la ruta de la caché y no la de la base; normativas ya usa la de la base (`delete ... select`).
- Normativas: `taller_normativa` (C-02), KPI y contador en el dashboard, y borrado de etiquetas sin uso.
- Formulario de descarga y modal con lista de enlaces (0006, 0010).
- Nuevas pantallas: establecimientos, instituciones sin vincular, historial; luego usuarios.
- Mejoras del dashboard (definición §5.4).
