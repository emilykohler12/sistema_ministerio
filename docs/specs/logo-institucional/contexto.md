# Contexto: logo institucional (#23)

Hechos del código al 2026-11-11 (informe de `Explore`). Sin diseño propuesto.

## 1. Dominio `configuracion`
- Migración `supabase/migrations/20261010015619_configuracion.sql`: tabla `configuracion` de una fila (`id smallint pk default 1 check (id=1)`), `nombre varchar not null check (btrim<>'')`, **`logo_ruta varchar` nullable, sin CHECK de formato** (L27; comentario L23 «queda NULL hasta que se implemente la subida del logo»), `telefono/correo/direccion/facebook/instagram varchar not null default ''`, `quienes_somos/mision/vision text not null default ''`, `updated_at`. RLS: select para `anon` y `authenticated`; update solo `es_admin()`; sin insert ni delete. **Sin grant de UPDATE por columna**: `logo_ruta` es editable por el admin como el resto. Triggers `configuracion_auditar` (insert, update y delete) y `configuracion_tocar_updated_at`.
- Tipos: `src/features/configuracion/types.ts` (`Configuracion = Tables<'configuracion'>`, `ConfiguracionCambios`); `logo_ruta: string | null` en `database.ts`.
- `consultas.ts`: `obtenerConfiguracion` (`select('*').eq('id',1).single()`) y `guardarConfiguracion(cambios)` (**update directo**, sin RPC, `.eq('id',1).select().single()`). Sin Storage ni `getPublicUrl` en el dominio.
- Hooks: `useConfiguracion` (`['configuracion']`) y `useGuardarConfiguracion` (`onSuccess` hace `setQueryData` con la fila devuelta).
- `src/pages/admin/ConfiguracionPage.tsx`: zod (nombre, correo, facebook/instagram `https://`), `useForm({ resolver, values: data })`; **el schema no declara `id`, `logo_ruta` ni `updated_at`** (zod 4 los descarta y nunca se envían). Usa `isLoading` (la regla pide `isPending`). Skeleton, rama de error con «Reintentar», «Cambios guardados» 2,5 s. En la Card «Datos institucionales» (L96-103) hay un `<span aria-hidden>` circular de 16x16 con `getInitials(nombre)`, dentro de un `div flex flex-col items-center gap-2`: es el lugar donde hoy iría el control. No hay control de logo.

## 2. Uso en el portal
- `PublicHeader.tsx` (L16-31): `nombre = config?.nombre || 'Sitio institucional'`; `span` aria-hidden de 9x9 con iniciales (o el ícono `School` si no hay); el nombre en texto al lado. Comentario L24 «Sin URL de Storage todavía (logo diferido)».
- `PublicFooter.tsx` (L5-21): igual, `span` de 8x8 con iniciales (fondo blanco) y `<p>{nombre}</p>`; teléfono, correo y redes después.
- «MD» sale de `getInitials` (`src/shared/lib/utils`), usado por Header, Footer y `ConfiguracionPage`. `HomePage` usa nombre/misión/visión, no logo. `ContactoPage` usa `useConfiguracion` con `isPending`/`isError`.
- `index.html`: `<title>Subsecretaría de Educación</title>` fijo y **sin `<link rel="icon">`**; en `public/` solo `favicon.svg` (sin referencia). No hay `<img>` en ningún componente de `src/`.
- `docs/specs/auth-configuracion/critica.md` L390-392 sugiere un solo componente `LogoInstitucional`, porque Header y Footer lo duplican.
- El panel de admin (`AdminSidebar`) muestra un bloque «SE» fijo.

## 3. Normativas como molde
- Bucket público `normativas` por migración (`20261010155300_normativas.sql` L240-263): `file_size_limit` 20971520, `allowed_mime_types` solo PDF; políticas de `storage.objects` solo `authenticated` con `es_admin()` (select, insert, delete; **sin update**). La lectura pública no necesita política. El bucket es la autoridad de formato y tamaño.
- `src/shared/lib/storage.ts`: `subirArchivo(bucket, ruta, file, mime)` (upsert false, `File` con el MIME canónico), `borrarArchivo` (`data: []` es falla), `borrarOAvisar`, `compensar` (borra solo ante rechazo con `code`).
- `normativas/consultas.ts`: wrappers con `BUCKET`; `urlPublica(ruta) = supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl` (cliente, sin red).
- `normativas/archivos.ts`: `validarPdf` por extensión, `rutaNueva()` = `<uuid>.pdf`. `secuencias.ts`: `altaNormativa` sube y guarda; `editarNormativa` sube el nuevo, llama a la RPC `guardar_normativa` con `p_ruta_archivo` y borra `resultado.ruta_anterior` (que la RPC lee con `FOR UPDATE`; null si no cambió).
- **Para `configuracion` no existe una RPC equivalente**: el update es directo y no devuelve la ruta anterior.
- `FileDropzone` (`src/shared/components/ui/`): props `id, invalid, describedBy, label, hint, multiple, accept, files, onChange, onFiles, inputRef`; input `sr-only`; con `multiple=false` entrega solo el primer archivo.

## 4. Tests de la zona
- `useConfiguracion.test.ts` (3 casos). No hay `consultas.test.ts` de configuración. No hay test de `PublicHeader`; sí de `PublicFooter`.
- `ConfiguracionPage.test.tsx`: L59 `guardarConfiguracion` no recibe `id`, `logo_ruta` ni `updated_at`; **L178-181 «no ofrece ningún control para cambiar el logo»** (queda en contradicción con esta feature).
- Fixtures con `logo_ruta: null` en `PublicFooter.test`, `ContactoPage.test`, `ConfiguracionPage.test` y `useConfiguracion.test`.
- pgTAP: `configuracion.test.sql` (plan 22: CHECK, fila única, `tocar_updated_at`, RLS; no menciona `logo_ruta`); `storage_global.test.sql` exige que toda política de escritura de `storage.objects` sea solo `authenticated` con `es_admin` (un bucket nuevo con el molde queda cubierto).
- E2E: `auth-configuracion.spec.ts` (L44 edición reflejada en el portal, L68 `/contacto`). Sin e2e de logo.

## 5. Script de huérfanos (#28)
- `scripts/limpiar-storage.ts` L26: `BUCKETS = ['talleres', 'normativas']`; referencias de `recurso.ruta_archivo` (L68-70) y `normativa.ruta_archivo` (L77). `planificar.ts` es genérico por clave de bucket. Para el logo habría que sumar el bucket y `configuracion.logo_ruta` (nullable, fila única). Mientras no esté, un logo huérfano no lo ve `storage:limpiar`.

## 6. Documentos
- `docs/definicion-dam.md` L210 (la configuración incluye el logo), L399, L556 (`logo_ruta` apunta a un bucket público), L571 y L589 (buckets públicos para normativas y logo). ADR 0007 L19 («logo en Storage público»); 0016 L9 («normativas y logo van a tener el mismo problema»). `docs/arquitectura.md`: dominio `configuracion` «Logo pendiente (Storage)» y la brecha del bucket del logo.

## 7. Reglas
- `react.md`: `isPending`; cada query con su rama de error y test; formulario de edición no se muestra hasta que la carga termina bien; `role="status"`/`alert` montado con su texto lleva `tabIndex={-1}` y foco en un efecto; textos alternativos y teclado. No hay patrón de `alt` ni de fallback `onError` para imágenes.
- `datos.md`: cubrir `{error}` y también el rechazo; **un reemplazo borra la ruta que devuelve la base, nunca la de la caché**; una mutación no mezcla escritura y lectura; lo genérico va en `src/shared/lib/`, un dominio no importa de otro.
- `migraciones.md`: una migración nueva por cambio (no editar la de configuración), RLS en la misma migración y un test por política.

## 8. Seguridad de imágenes
- No hay lugar donde el admin suba SVG hoy (recursos: PDF, PPTX, DOCX, JPG, PNG, WebP, MP4; normativas: PDF). Sin `dangerouslySetInnerHTML` en `src/` (por grep). No hay CSP ni headers de seguridad en el repo (`index.html`, `vite.config.ts`; no existe `vercel.json` ni `netlify.toml`).
