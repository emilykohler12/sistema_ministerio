---
name: supabase-storage-trampas
description: Lo verificado sobre Supabase Storage en la crítica de la spec recursos (2026-10-10): flujo de subida de storage-api, MIME en storage-js, triggers que leen storage.objects
metadata:
  type: project
---

En la crítica de la spec `recursos` (2026-10-10, primer corte con Storage) verifiqué estas cosas contra el código y la base local.
La respuesta está en `docs/specs/recursos/critica.md` (`## Respuesta`, la escribe el usuario):
- **storage-api v1.79** (`/app/dist/storage/uploader.js` en el contenedor `supabase_storage_*`): primero chequea el permiso con
  `testPermission` (insert con rollback), después sube al backend y recién ahí crea la fila con `metadata`, en `completeUpload`, en una
  transacción como superusuario que se confirma antes de responder. Conclusión: no hay carrera "subida todavía no visible" si el cliente
  espera a `upload()`.
- **storage-js 2.117:** un `File` o un `Blob` viaja como multipart y `options.contentType` se ignora. El bucket valida el `file.type` del
  navegador. Para fijar el MIME hay que mandar `new File([f], name, { type })`. Deducir el tipo por la extensión, no por `file.type`.
- **Un trigger BEFORE que lee `storage.objects`**, o cualquier tabla con RLS, corre antes que el WITH CHECK de la RLS. Si lanza un error
  cuando "no ve" algo, anon y los usuarios sin marca reciben ese error en lugar de `42501`. Esto rompe los pgTAP de "no admin → 42501".
  Pasó con `DA003` en recursos, y es la misma trampa que `taller_validar_categoria` esquivó con "si no ve, no decide".
- Un `DELETE` SQL sobre `storage.objects` da `42501` (`protect_objects_delete`), y un insert en `storage.buckets` desde una migración
  funciona. Las verificó el agente principal en el `contexto.md` de recursos.
- Propuse que la guardia global de Storage espere al segundo bucket (normativas, público), con un `is_empty` sobre `pg_policies` que
  verifique que no haya escritura para anon ni para public.

En la crítica del código de la fase A de recursos (2026-10-10) aparecieron más cosas:
- **El delete de `storage.objects` sí se puede probar en pgTAP.** `protect_delete` es un trigger `FOR EACH STATEMENT` que deja pasar el
  borrado si `storage.allow_delete_query = 'true'`. storage-api fija ese valor en cada request (`internal/database/postgres/scope.js`) y borra
  con el rol del usuario y la RLS activa (`DELETE ... RETURNING`). El test tenía solo un `exists` sobre `pg_policies` con
  `qual like '%talleres%'`, que pasaba aunque la política no tuviera `es_admin()`.
- **`remove()` devuelve `{ data: [], error: null }` si no borró nada** (la RLS lo oculta o el objeto no existe). Hay que tratar
  `data.length === 0` como falla.
- **Permisos que pide cada llamada:** `upload` con `upsert: false` pide insert (el `canUpload` con el rol del usuario; el resto corre
  como superusuario). `remove` pide delete y select. `createSignedUrl` pide select.

En la crítica del código de la fase B de recursos (2026-10-10):
- **Compensar ante un error ambiguo rompe el invariante.** postgrest-js 2.117 no reintenta POST/PATCH, y una falla de transporte vuelve
  con `code: ''` y `status: 0`. Si el insert/update se confirmó y la respuesta se perdió, borrar el archivo deja una fila colgada. Propuse
  compensar solo ante un rechazo del servidor (`code` no vacío) y, si no, avisar del huérfano sin borrar.
- Invalidar una vez por lote (lo propuse yo) deja la caché vieja durante el lote: hay que bloquear reordenar mientras dura (`P0001`).
- `idDeYoutube` con host exacto y regex de 11 caracteres es seguro para el `src` del iframe. La URL externa ya está protegida por el CHECK `https://`.

En la crítica de la spec `normativas` (2026-10-10, primer bucket público):
- `getPublicUrl(ruta, { download })` → storage-api responde `Content-Disposition: attachment` (`/app/dist/storage/renderer/renderer.js`),
  así que descarga en vez de abrir en pestaña. `getPublicUrl` no necesita política; `remove()` sigue necesitando select + delete del admin.
- Una guardia global de Storage que solo mire `to anon/public` no ve una política `to authenticated` sin `es_admin()` ni una `for all`:
  pedir que toda política de escritura tenga `roles = {authenticated}` y `es_admin`.

En la crítica de la spec `descargas` (2026-10-10; propone ADR 0022: RPC + política SELECT de anon en lugar de la Edge Function):
- **storage-js `createSignedUrl` con `download`** arma el parámetro con `URLSearchParams` y después aplica `encodeURI` a toda la URL
  (`dist/index.mjs:1047-1051`). Los nombres con tildes se codifican dos veces. Hay que sanear el nombre o verificarlo con Playwright
  `suggestedFilename()`.
- **Si anon firma, el `expiresIn` lo elige el cliente** y despublicar no revoca los enlaces emitidos. Una política SELECT de anon atada a
  `exists (recurso visible)` no expone nada nuevo al listar (es lo mismo que `GET /recurso`) y oculta los huérfanos. Calificar `objects.name`.
- El perfil `critico` **no** deja usar `docker`, `psql` ni `sed`/`for` en Bash: verificar en `node_modules` con grep/Read o marcar "a verificar".

En la crítica de la spec `subida-reanudable` (2026-11-10, #29, TUS con tus-js-client). Lo que sigue sale del código fuente de la librería y no
se verificó en `node_modules`, porque todavía no estaba instalada:
- El `defaultOnShouldRetry` de tus-js-client **no reintenta sin conexión** (`&& isOnline()`, `navigator.onLine`). En cambio sí reintenta 409 y 423, y
  no reintenta el resto de los 4xx. Los `retryDelays` por defecto suman 9 s. Tampoco hay evento de «reintentando»: hay que usar un `onShouldRetry` propio.
- Si el HEAD de retomar da 4xx, la librería crea un upload nuevo. Con `x-upsert: false` eso da 409, que se reintenta.
- `abort(true)` en la carrera con el último PATCH puede dejar un objeto completo sin fila: el huérfano de 0016.
- Quedaron a verificar en storage-api: CORS de `Location`, 413 por `Upload-Length`, 415 por el metadato `contentType`, soporte de DELETE, HEAD tras
  completar, si exige `apikey` y si expira los incompletos.

En la crítica del código de `subida-reanudable` (2026-11-10), verificado en `node_modules/tus-js-client` 4.3.1 (`lib.esm/upload.js`):
- **`abort(true)` → `BaseUpload.terminate` llama al `onShouldRetry` del usuario** (`:886` → `:1033`) si el DELETE falla, y reintenta el DELETE con
  los mismos `retryDelays`. Un `onShouldRetry` con efectos (p. ej. `onReintento()`) se dispara después de que la promesa ya resolvió. Hay que tener
  un flag "cerrada" en el adaptador, y el fake de los tests no lo modela.
- `abort()` limpia `_retryTimeout` (`:422`), y `_emitError` no emite nada si `_aborted` (`:445`). Con `url == null` (POST en vuelo) no hay DELETE.
- `vi.mocked(fn)` sobre una función con sobrecargas toma la **última**. Un implementador agregó sobrecargas en producción solo para tipar mocks.
- Con «Cancelar» escondido por `fase === 'finalizando'`, un `reintentando` al 100 % lo vuelve a mostrar. Conviene derivarlo de `progreso < 100`.

**Why:** Storage es un sistema aparte, sin transacción común con Postgres. Sus detalles (qué MIME llega, cuándo se ve la fila) no salen
en los tipos ni en el pgTAP y deciden si un diseño se sostiene.

**How to apply:** en cortes con Storage (normativas, logo, descargas), buscar triggers que lean `storage.objects`, tipos deducidos de
`file.type` y expectativas de `42501` cuando hay un trigger BEFORE de por medio. Antes de afirmar algo de la librería, verificarlo en
`node_modules` o en el contenedor. Relacionado: [[postgres-rpc-triggers-trampas]], [[supabase-auth-rls-trampas]].
