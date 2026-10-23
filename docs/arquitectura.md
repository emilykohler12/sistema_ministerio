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
los datos. Solo la gestión de usuarios (futura) pasa por Edge Functions: la descarga de talleres usa la RPC `registrar_descarga` y una
política de Storage (0022).

## Dominios (`src/features/`)

| Dominio | Qué contiene |
|---|---|
| `talleres` | Niveles, categorías, talleres y sus destinatarios y etiquetas. Catálogo público y gestión admin. **Niveles, categorías y talleres migrados a Supabase** (0012; cortes 2 y 3): `types.ts` derivado (`NIVELES` y `DESTINATARIOS` son constantes con las filas fijas de la base, sin hook; `Taller` = fila + `categoria.nivel_id` + destinatarios + etiquetas + recursos), `consultas.ts` (solo supabase; talleres con embeds y escritura con la RPC `guardar_taller`), `errores.ts` y `filtrar.ts` (puros, sin imports de supabase: `DA001`/`DA002`, normalización y filtros del catálogo) y hooks sobre las claves únicas `['categorias']` y `['talleres']`. El portal lee solo publicados (`useCatalogo`, `useTallerPublicado`); el panel, todos (`useTalleres`, `useTaller`). Los recursos viajan embebidos en el taller (`recurso: Recurso[]`, ordenados por `orden`, `id`); `CLAVE_TALLERES` se exporta para que `recursos` invalide la caché |
| `recursos` | Archivos y enlaces de los talleres, con el bucket privado `talleres` de Storage. **Migrado a Supabase** (0012; corte 4): `types.ts` derivado (`Recurso`, `TipoRecurso`, `ETIQUETA_TIPO_RECURSO`), `archivos.ts` (puro: tabla `FORMATOS` extensión → tipo y MIME, que fija el tipo y el MIME por la extensión y no por `file.type`; `validarArchivo`, `rutaNueva`, `idDeYoutube`, `formatearTamanio`), `consultas.ts` (solo supabase: Storage, tabla y RPC `ordenar_recursos`), `secuencias.ts` (alta, reemplazo y eliminación con el orden y las compensaciones entre base y Storage), `errores.ts` (413/415 de Storage) y hooks de mutación que invalidan `CLAVE_TALLERES`. La lectura no tiene hook propio: sale de `useTaller` / `useTallerPublicado`. `components/ListaRecursos` es la sección del portal (YouTube integrado con `youtube-nocookie.com`, otros enlaces externos). La descarga es del dominio `descargas`; `nombreDeDescarga` (puro) vive en `archivos.ts` |
| `normativas` | Normativas con número, año, etiquetas y un PDF en el bucket **público** `normativas`. **Migrado a Supabase** (0012; corte normativas): `types.ts` derivado (`Normativa` = fila + `etiqueta: Etiqueta[]` + `url` pública), `archivos.ts` (puro: `validarPdf`, tope de 20 MiB, `rutaNueva()` = `<uuid>.pdf`), `consultas.ts` (solo supabase: `getPublicUrl`, RPC `guardar_normativa` y `contar_descarga_normativa`), `secuencias.ts` (alta, reemplazo con la `ruta_anterior` que devuelve la RPC y baja, según 0016), `errores.ts` (23505, 413 y 415), `filtrar.ts` (título, número, descripción y etiquetas, sin tildes; orden año desc e `id` desc) y hooks sobre `['normativas']`. `useContarDescarga` cuenta una vez por normativa en la visita (`sessionStorage`), sin esperar la respuesta. `components/EnlaceDescarga` abre el PDF en otra pestaña |
| `etiquetas` | Catálogo compartido por talleres y normativas: `types.ts`, `consultas.ts` (lee la tabla `etiqueta`) y `useEtiquetas` (`['etiquetas']`), que alimenta las sugerencias de ambos formularios. Los guardados de taller y de normativa invalidan esa clave |
| `descargas` | Descarga de talleres por el formulario cargo → localidad → institución (0006, 0010, **0022**). **Migrado a Supabase** (corte descargas): `types.ts` (`TipoInstitucion` derivado, `CARGOS`, `DatosDescarga`, `EnlaceDescarga`), `esquema.ts` (puro: zod con los límites de la base y los `refine` de "Otro" y "Otra"), `consultas.ts` (solo supabase: RPC `registrar_descarga` y `firmarEnlaces` con `createSignedUrl` de 1 h, en el orden de `orden`), `errores.ts` (puro: `DA003` taller no disponible y `DA004` institución no disponible), `visita.ts` (formulario y talleres registrados en `sessionStorage` y en un `Set` de módulo; el formulario se valida con el esquema al leerlo) y dos hooks: `useRegistrarDescarga` (mutación: registra si el taller no está marcado y lo marca solo cuando la RPC responde bien; `DA004` invalida los establecimientos de la localidad) y `useEnlacesDescarga` (query `['descargas', 'enlaces', id]` con `gcTime: 0`, que firma al abrir y se reintenta con `refetch`, sin poder registrar). `components/DescargaModal` tiene dos pasos (formulario y lista de recursos con "Reintentar" si falla la firma); cuando el taller deja de estar disponible (`DA003`, o una firma que falla) invalida `['talleres']` al cerrarse y no antes, para que el mensaje se vea; el detalle del taller muestra "Descargar" si el taller tiene recursos |
| `establecimientos` | Padrón de escuelas por localidad. **Fase A migrada a Supabase** (0010, 0012; corte padrón): `types.ts` derivado (`Localidad` = fila, 79 municipios; `Establecimiento` = fila; `DatosEstablecimiento`, `CambiosEstablecimiento`; `GrupoSinVincular` = fila de `Returns` de `instituciones_sin_vincular`), `esquema.ts` (puro: el zod del formulario, compartido por la página de edición y el diálogo de alta), `consultas.ts` (solo supabase; los establecimientos se piden por localidad por el tope de 1000 filas de PostgREST; más las RPC `instituciones_sin_vincular` y `vincular_institucion`), `errores.ts` (puro: distingue `esCueDuplicado` de `esNombreDuplicado` por el nombre de la constraint dentro de `message`, porque PostgREST no expone `constraint_name`; `esVinculacionInvalida` para `DA005` y los mensajes compartidos), `filtrar.ts` (nombre o CUE, sin tildes) y hooks: `useLocalidades` (`['localidades']`, `staleTime: Infinity`), `useEstablecimientos(localidadId)` (`['establecimientos', id]`), `useEstablecimiento(id)` (`['establecimientos', 'detalle', id]`), mutaciones que invalidan `['establecimientos']`, `useSinVincular` (`['establecimientos', 'sin-vincular']`) y `useVincular` (invalida `['establecimientos']` y `['dashboard']` en `onSettled`). El panel (`pages/admin/establecimientos`) elige la localidad por `?localidad=<id>`. `SinVincularPage` (`/admin/establecimientos/sin-vincular`, #19) lista los grupos de descargas "Otra" sin establecimiento y los asigna con dos diálogos hermanos (`DialogoVincular` elige un activo de la misma localidad; `DialogoCrear` crea y vincula en dos llamadas, y "Reintentar" solo vincula con el id ya creado); el resultado se anuncia en un `role="status"` y el foco vuelve al encabezado. Vincular conserva `OTRA` e `institucion_otra`. Sin carga masiva (fase B) ni consumo público todavía |
| `dashboard` | Métricas del administrador sobre `registro_descarga`. **Migrado a Supabase** (0012; corte dashboard): `types.ts` derivado de `Functions[...]['Returns']`, `periodo.ts` (puro: URL ↔ `{tipo, desde, hasta, porMes}`, "hoy" en hora de Argentina con `Intl`, 30 días = `[hoy-29, hoy]`, año en curso = `[1 de enero, hoy]`, `porMes` si el período pasa de 92 días y `validarPeriodo` con `2020-01-01 <= desde <= hasta <= hoy`), `calculos.ts` (puro: `porcentaje`, `cobertura` y los órdenes, porque las RPC devuelven solo conteos), `consultas.ts` (solo supabase: las seis RPC `metricas_*` y el select de `normativa` en un `Promise.all`; si una falla, falla todo) y `useMetricas(periodo)` (clave `['dashboard', desde, hasta]`, `keepPreviousData`, deshabilitado con un período inválido). La página resuelve primero el período inválido (error junto a los campos, sin consulta ni skeletons) y después carga, error o datos. El período vive en la URL (`?periodo=30d\|anio\|rango&desde&hasta`) y las fechas del rango se aplican 300 ms después de editarlas. Serie, ranking, nivel, cargo, localidad y normativas son tablas HTML con barras CSS (`components/`), sin recharts. `KpiCard` y `Seccion` (región con nombre) son del dominio |
| `historial` | Historial de operaciones del administrador (#20), solo lectura sobre `registro_operacion`. **Migrado a Supabase** (0012; corte historial): `types.ts` derivado (`Operacion` = fila, `UsuarioHistorial` = `Returns` de `usuarios_historial`), `entidades.ts` (puro: mapa tabla → entidad tipado como `Record<Exclude<keyof Tables, 'registro_operacion'>, Entidad>` con `satisfies`, de modo que una tabla nueva rompe el typecheck; `ENTIDADES_FILTRABLES` sin Nivel, Localidad ni Destinatario, que son solo SELECT; Taller agrupa sus puentes y Normativa la suya; `describir` = nombre o título de `datos_nuevos ?? datos_anteriores`, `#<registro_id>` o los dos ids de una puente), `diff.ts` (puro: `cambios(op)` = campos que cambiaron sin `updated_at` en una modificación, todos en un alta o una baja; vacío si solo cambió `updated_at`), `usuarios.ts` (puro: `nombreDeUsuario` = "Sistema", email o uuid corto), `filtros.ts` (puro: URL ↔ `{desde, hasta, usuario, entidad, pagina}` que descarta lo inválido, `validarFiltros` solo para fecha mal formada y `desde > hasta`, `limitesDelDia` con `-03:00` fijo), `consultas.ts` (solo supabase: `count: 'exact'`, `.is('usuario_id', null)` para "Sistema", `.in('tabla')`, `order('id', desc)` y `.range` de 50; `PGRST103`, página fuera de rango, se traduce a `{ filas: [], total: null }`; más la RPC `usuarios_historial`) y dos hooks: `useHistorial(filtros)` (`['historial', filtros]`, `keepPreviousData`, deshabilitado con filtros inválidos) y `useUsuariosHistorial()` (`['historial', 'usuarios']`). `components/`: `FiltrosHistorial`, `TablaHistorial` (tabla HTML con fila expandible por botón con `aria-expanded`; una modificación sin cambios dice "Sin cambios en los campos del registro" y no se expande) y `DetalleOperacion`. La página (`HistorialPage`) guarda filtros y página en la URL (las fechas con borrador local, espera de 300 ms y `replace`), colapsa la fila al cambiar la vista, usa `isPlaceholderData` con `aria-busy` sin deshabilitar la paginación y mueve el foco al total al llegar la página nueva. Si falla solo la consulta de usuarios, la lista sigue con el uuid corto. Genéricos: `ui/Paginacion` y `formatFechaHoraArgentina` en `shared/lib/date.ts`. Las puentes se describen por ids (nombres con #34 o una vista) |
| `configuracion` | Datos institucionales del sitio. **Migrado a Supabase** (primer corte, 0012): `types.ts` derivado, `consultas.ts`, hooks delgados; sin mocks. Logo pendiente (Storage) |
| `auth` | Sesión del administrador con Supabase Auth (0005). `AuthContext` escucha solo `onAuthStateChange`; `esAdmin.ts` (puro, solo UX) exige `app_metadata.admin`; sesión en `sessionStorage`. Limpia la caché de React Query cuando cambia el usuario derivado (anon/admin), porque la RLS hace que los datos dependan del rol. Cierre por inactividad (§5.2, #22): `useInactividad` (hook sin supabase; mide con `Date.now()` revisando cada 1 s y al volver a la pestaña; `pointerdown`, `keydown`, `scroll` y `touchstart` reinician el plazo de 30 min, pero con el aviso visible solo `extender` lo hace, y una actividad o un `extender` posteriores al límite cierran en lugar de extender), `restante.ts` (puro: `formatearRestante` y los hitos de `mensajeRestante`) y `components/AvisoInactividad` (`alertdialog` sobre `ui/Dialog` 2 min antes, con `role="timer"` y un `status` que solo cambia en hitos). `AdminLayout` monta el hook cuando hay usuario y, al vencer, llama a `cerrarSesion()` y el `Navigate` al login lleva `state.motivo = 'inactividad'`, que `LoginPage` muestra en un `role="alert"`. El cierre es del cliente: no invalida la sesión en el servidor |

## Rutas

- Públicas: `/`, `/talleres`, `/talleres/:id`, `/normativas`, `/contacto`
- Admin: `/admin/login`, `/admin` (dashboard), `/admin/normativas`, `/admin/historial` (`?desde&hasta&usuario&entidad&pagina`), `/admin/configuracion`, `/admin/establecimientos` (`?localidad=<id>`), `/admin/establecimientos/sin-vincular`, `/admin/establecimientos/nuevo`, `/admin/establecimientos/:id/editar` y el árbol de talleres, con ids numéricos
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
Pruebas en el navegador (0020): Playwright con Chromium headless (se instala al crear el contenedor), `npm run test:e2e`, specs en `e2e/` y
`playwright.config.ts` (un worker, levanta `npm run dev` si no hay servidor). Corren contra el Supabase local con `admin@dam.local`
(`e2e/helpers.ts`: `loginAdmin`). Las escribe el agente `qa` después de implementar; Vitest no toma `e2e/`. Sin CI por ahora.

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
- `migrations/<ts>_descargas.sql`: enum `tipo_institucion` (`PADRON`, `OTRA`, `SIN_INSTITUCION`) y `registro_descarga` (hecho histórico: sin `updated_at`, FK sin cascada,
  CHECK de cargo y de coherencia cargo/institución; select solo `es_admin()` y sin grants de escritura para `anon` ni `authenticated`). Trigger `auditar()` solo
  `after update or delete`: el INSERT anónimo no se audita (0022; `auditoria_global` exige los tres eventos con excepciones por evento). RPC `registrar_descarga`
  (security definer, `anon` y `authenticated`): anula los campos que no corresponden al discriminador, exige el taller `PUBLICADO` (`DA003`) y, con `PADRON`, un
  establecimiento activo de la localidad (`DA004`). Con sesión de admin (`es_admin()`) valida igual y vuelve antes del `insert`: no cuenta y no evalúa los CHECK (el zod del
  formulario aplica las mismas reglas); `contar_descarga_normativa` tampoco suma para el admin (`<ts>_no_contar_admin.sql`, #25). Política `talleres_select_anon` de `storage.objects`: anon lee los objetos del bucket `talleres` que tienen fila en `recurso`
  de un taller publicado (para firmar los enlaces).
- `migrations/<ts>_vinculacion.sql` (#19): `instituciones_sin_vincular()` (invoker, `42501` sin `es_admin()`; un grupo por `(localidad_id, lower(inmutable_unaccent(btrim(institucion_otra))))`, la misma clave de
  `metricas_resumen.sin_vincular`; nombre más frecuente, otras variantes, descargas y última; orden descargas desc, última desc, localidad, nombre) y `vincular_institucion(localidad, nombre, establecimiento)`
  (**security definer**, `search_path` vacío; `es_admin()` → `42501`, `FOR SHARE` sobre el establecimiento, `DA005` si no existe, está inactivo o es de otra localidad; actualiza solo `establecimiento_id` de las `OTRA` sin
  vincular del grupo y devuelve cuántas, 0 si ya estaban). EXECUTE solo para `authenticated`. `registro_descarga` sigue sin grant de UPDATE ni política: la RPC es la única forma de escribir y cada UPDATE queda en `registro_operacion`.
- `migrations/<ts>_metricas.sql`: índice `registro_descarga_fecha_hora_idx` por `fecha_hora`, la auxiliar `metricas_registros(desde, hasta)` como única fuente del período
  (filtro sargable en hora de Argentina; devuelve `dia` local y no expone `cargo_otro`) y seis RPC de agregación que la reutilizan (`metricas_resumen`, `_por_periodo`, `_por_taller`,
  `_por_nivel`, `_por_cargo`, `_por_localidad`). Todas `security invoker`, `search_path` vacío y EXECUTE solo para `authenticated`: sin la marca de admin dan `42501` (se evalúa primero)
  y con un período inválido (nulo, invertido, anterior a 2020-01-01 o posterior a hoy) dan `22023`. Devuelven solo conteos: porcentajes, cobertura y orden los calcula el cliente.
- `migrations/<ts>_historial.sql` (#20): índices `registro_operacion_fecha_hora_idx (fecha_hora)` y `registro_operacion_tabla_fecha_hora_idx (tabla, fecha_hora)` y la RPC `usuarios_historial() returns table (id uuid, email text)` (**security definer**, `search_path` vacío, **plpgsql** porque `es_admin()` se evalúa primero y una función `sql` no puede lanzar el `42501`; `usuario_id` distintos de `registro_operacion` cruzados con `auth.users`, `email::text` no nulo, orden por email, los baneados siguen saliendo; EXECUTE solo `authenticated`, con `revoke` explícito de `public`, `anon` y `service_role`). Es la única forma de ver los emails: `auth.users` no es legible por el admin.
- Cada corte de dominio agrega su migración, sus tablas con RLS, el trigger `auditar()`, el trigger
  `tocar_updated_at()` si la tabla tiene `updated_at`, y sus tests. Las guardias globales de `supabase/tests/`
  (`rls_global`, `auditoria_global`, `truncate_global`, `updated_at_global`) fallan si se olvida alguno. `storage_global` exige que toda
  política de escritura de `storage.objects` sea de `authenticated` con `es_admin`.
- Storage desde el frontend: `src/shared/lib/storage.ts` (`subirArchivo` y `borrarArchivo` por bucket, `compensar` y `borrarOAvisar` de 0016).
  Cada dominio lo envuelve en su `consultas.ts` y ordena las operaciones en su `secuencias.ts`.

## Brechas entre el código y la definición v2

Describen el sistema; el trabajo pendiente y quién lo tiene se siguen en los issues de GitHub (0026, `/siguiente`).

- Integrar Supabase: la base transversal, el cliente (`src/shared/lib/supabase.ts`, variables `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`) y el login real están listos; falta la carga real del padrón con la muestra (C-08: el script ya existe, ver Entorno; faltan sus columnas, las equivalencias de localidad y correrlo contra la nube), el bucket del logo.
  Recuperación de contraseña pendiente.
- Descargas: faltan el captcha (Turnstile; obligaría a volver a una Edge Function), el límite de frecuencia y el tope de `expiresIn` (hoy lo elige
  el cliente y despublicar no revoca los enlaces ya emitidos, 0022), "Descargar todo (.zip)".
- Recursos: limpieza de archivos huérfanos en Storage
  (hoy solo un `console.warn`; vale también para normativas), subida reanudable (TUS) y barra de progreso.
- Normativas: `taller_normativa` (C-02) y borrado de etiquetas sin uso. Las descargas de normativas por período exigen una tabla de eventos (hoy el dashboard muestra el contador acumulado).
- Nuevas pantallas: usuarios. Instituciones sin vincular: falta desvincular, descartar grupos basura y alias automáticos.
- Dashboard: validar los indicadores con el Ministerio (C-11), las descargas de normativas por período (hoy solo el contador
  acumulado).
