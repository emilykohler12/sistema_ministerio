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

**Why:** Storage es un sistema aparte, sin transacción común con Postgres. Sus detalles (qué MIME llega, cuándo se ve la fila) no salen
en los tipos ni en el pgTAP y deciden si un diseño se sostiene.

**How to apply:** en cortes con Storage (normativas, logo, descargas), buscar triggers que lean `storage.objects`, tipos deducidos de
`file.type` y expectativas de `42501` cuando hay un trigger BEFORE de por medio. Antes de afirmar algo de la librería, verificarlo en
`node_modules` o en el contenedor. Relacionado: [[postgres-rpc-triggers-trampas]], [[supabase-auth-rls-trampas]].
