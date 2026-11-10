# Paso 0: prueba de concepto de TUS contra el Supabase local (#29)

- **Fecha:** 2026-11-10
- **Entorno:** Supabase CLI 2.120.0, storage-api `v1.79.36` local, Node 24.21, `tus-js-client` 4.3.1.
- **Qué se hizo:** scripts descartables fuera del repo (scratchpad de la sesión, `poc-tus/`), con `tus-js-client` en Node contra
  `http://127.0.0.1:54321/storage/v1/upload/resumable`, JWT real de `admin@dam.local` / `sin-permiso@dam.local` (supabase-js con la clave
  publicable local), `bucketName=talleres`, `objectName=1/<uuid>.pdf`, cabeceras `x-upsert: false` y `apikey`, trozos de 6 MiB.
  Los cortes de red se simularon con un proxy TCP local que cierra la conexión a mitad de un PATCH. Al final: `npm run db:reset`.
- **Conclusión:** la spec se sostiene. TUS está habilitado en el local sin tocar `config.toml`, y no apareció ningún bloqueo. Hay **cinco
  ajustes de detalle** (ver «Impacto en la spec») y **un límite de la prueba**: el local usa el backend de archivos, no S3, así que la
  retención de un upload incompleto y la regla de los 6 MiB no se pueden verificar acá.

## Dependencia

| Ítem | Resultado |
|---|---|
| Versión | `tus-js-client` 4.3.1 (queda `^4.3.1` en `package.json`; el lock suma 20 paquetes, 168 líneas) |
| Licencia | MIT |
| `npm audit` | 3 altas, **ninguna viene de esta dependencia**: `undici`, `vite` (directa) y `zod` (directa), ya existentes. `tus-js-client` no figura |
| Dependencias propias | `buffer-from`, `combine-errors`, `is-stream`, `js-base64`, `lodash.throttle`, `proper-lockfile`, `url-parse` |
| Campo `browser` | `package.json` mapea `lib.esm/node/index.js` → `lib.esm/browser/index.js` (y los equivalentes `es5` y `lib`). El módulo de navegador solo importa `./fileReader`, `./httpStack` (XHR), `./urlStorage` (localStorage), etc. |
| Bundle de navegador | Empaquetado con rolldown (`--platform browser`) de `import * as tus`: 114 kB sin minificar, **61 kB minificado, 15,7 kB gzip**, sin `proper-lockfile`, `fs`, `http` ni `node:*`. El mismo entry con `--platform node` pesa 317 kB e incluye `proper-lockfile`: el campo `browser` funciona |

## Resultados

| # | Pregunta | Resultado | Evidencia |
|---|---|---|---|
| a | ¿Un archivo de ~13 MiB (3 trozos) completa, aparece en `storage.list` y se puede firmar y descargar? | **Sí.** | `POST 201` (`Upload-Length: 13631488`, `Location` absoluto), `PATCH 204` con `Upload-Offset` 0 → 6291456, 6291456 → 12582912, 12582912 → 13631488. `storage.list('1')` devuelve el objeto (`size` 13631488, `mimetype` application/pdf). `createSignedUrl` y la descarga dan 200, `content-type: application/pdf`, los mismos bytes y el mismo SHA-256. `onProgress` avanza de a 64 KiB (0, 65536, … 13631488). Un archivo de exactamente 50 MiB (9 PATCH) también completa |
| b | ¿Problema de CORS con `Location` y `Upload-Offset` desde un origen de navegador? | **No.** | Con `Origin: http://localhost:5173`: los `OPTIONS` de POST, PATCH, HEAD y DELETE dan 200 con `access-control-allow-origin: *`, `allow-methods` con todos los verbos y `allow-headers` que refleja lo pedido (`authorization,apikey,tus-resumable,upload-length,upload-metadata,x-upsert,content-type,upload-offset`). El `POST` y el `PATCH` reales traen `access-control-expose-headers: Authorization, Content-Type, Location, Tus-Extension, Tus-Max-Size, Tus-Resumable, Tus-Version, Upload-Concat, Upload-Defer-Length, Upload-Length, Upload-Metadata, Upload-Offset, …` (Kong 2.8.1). `Location` es absoluto sobre el mismo host de la API. Límite: probado con cabeceras HTTP crudas desde Node, no con un navegador real; lo cubre el e2e |
| c | ¿Qué pasa con un usuario sin la marca admin y con anon? | **Se rechazan al crear, sin subir un byte.** | `sin-permiso@dam.local`, anon con JWT anon, anon con `Authorization: Bearer <publishable>` y sin `Authorization`: todos `POST 403`, cuerpo de texto `new row violates row-level security policy`. La política de insert del admin alcanza; no hace falta tocar nada. Además la RLS se reevalúa en cada PATCH: crear con el admin y seguir con el token de `sin-permiso` da `PATCH 403`. Token con firma inválida: `POST 400` y cuerpo `{"statusCode":"403","code":"AccessDenied","error":"Unauthorized","message":"JWS Protected Header is invalid"}` |
| d | Archivo de 51 MiB: ¿qué status y qué cuerpo? | **413 al crear**, antes de enviar bytes. | `POST 413` (15 ms), cuerpo de texto `Maximum size exceeded\n`. 50 MiB + 1 byte: igual 413. 50 MiB exactos: completa. El servidor decide por `Upload-Length`, así que no se gasta ancho de banda |
| e | `contentType` no permitido (`application/x-msdownload`): ¿415? | **Sí, 415 al crear.** | `POST 415`, cuerpo `mime type application/x-msdownload is not supported`. También con nombre `.pdf` y con `text/html`. El bucket valida el `contentType` de los metadatos, no la extensión |
| f | Cortar a mitad y retomar: ¿el siguiente PATCH lleva `Upload-Offset` > 0 y completa? | **Sí, en los dos casos.** | (f1) Proxy que corta la conexión a ~2,9 MiB del 2.º PATCH: `onShouldRetry` recibe `status 0` («failed to upload chunk at offset 6291456, caused by Error: write ECONNRESET»), a los 0 ms tus hace `HEAD 200` con `Upload-Offset: 6291456` (descarta lo parcial del trozo cortado), luego `PATCH` con `Upload-Offset: 6291456` → 12582912 y `PATCH` con 12582912 → 13631488 y `onSuccess`. Objeto íntegro (mismo SHA-256). Sin 423 ni espera. (f2) Proceso matado con `SIGKILL` en el 2.º PATCH, `HEAD` desde otro proceso: `Upload-Offset: 12582912`; un `Upload` nuevo con `uploadUrl` hace `HEAD` y `PATCH` con `Upload-Offset: 12582912` y completa, mismo SHA-256 (el criterio 9 dice que no se retoma tras recargar: acá se verificó que técnicamente se podría) |
| g | `upload.abort(true)` a mitad: ¿qué responde el DELETE? | **`DELETE 204`, sin lock.** | Entre trozos: `DELETE 204` (20 ms), `HEAD` posterior 404, el nombre no aparece en `storage.list`. Con un PATCH realmente en vuelo (proxy lento; el PATCH abortado no tiene respuesta): `DELETE 204` (10 ms), `HEAD` 404 a los 1,5 s. Con `retryDelays: []` y con `[0, 500, 1000]` igual. La promesa de `abort(true)` resuelve en ~10-20 ms. `abort(false)` no manda DELETE: el upload queda (`HEAD 200`, `Upload-Offset` del último trozo confirmado) |
| h | ¿Qué responde un HEAD sobre un upload ya completado? | **`200` con `Upload-Offset` = `Upload-Length`.** Y sin `Authorization` también. | `HEAD 200`, `upload-offset: 13631488`, `upload-length: 13631488`, `upload-metadata` con bucket, objeto y MIME. Un `PATCH` posterior (0 bytes en el offset final) da **409** `The resource already exists`, y un `DELETE` sobre el completo también **409**; el objeto sigue. Un segundo `POST` con el mismo `objectName` y `x-upsert: false` da **409** `The resource already exists` al crear |
| i | ¿Cuánto retiene el servidor un upload incompleto? | **No se pudo medir en el local.** | El local usa `STORAGE_BACKEND=file` (`FileStore`), no S3. En esta versión de storage-api la expiración (`TUS_URL_EXPIRY_MS`, 1 h por defecto) solo se pasa a `S3Store`; `FileStore.deleteExpired()` existe pero **nada lo invoca**. Resultado: los incompletos locales no vencen nunca (un upload de `abort(false)` hecho al inicio de la sesión seguía con `HEAD 200` y su offset ~10 minutos después, sin cabecera `Upload-Expires`) y quedan en disco aunque se haga `db:reset`. En la nube (S3, multipart) la retención depende de `TUS_URL_EXPIRY_MS` y de la limpieza de multiparts incompletos del proveedor. De memoria, la documentación de Supabase habla de 24 h de validez de la URL; **no verificado, sin nube** |
| j | ¿`npm run storage:limpiar` (simulación) ve algo de un upload incompleto? | **No.** | Con 6 uploads incompletos en disco (6 y 12 MiB ya confirmados) y `--edad-minima=0`, el informe lista solo los 7 objetos completos (13 MiB, 1 MiB, 50 MiB, …). En `storage.objects` no hay fila de ningún incompleto, `storage.list` no los devuelve y `storage.s3_multipart_uploads` está en 0. Un incompleto no es un objeto: ocupa disco o S3 sin que la limpieza lo vea |
| k | ¿Hace falta algo en `supabase/config.toml`? | **No.** | Todo lo anterior corrió con el `config.toml` actual: el contenedor de storage ya trae `TUS_URL_PATH=/storage/v1/upload/resumable` y Kong enruta ese prefijo. `file_size_limit = "50MiB"` del `[storage]` y el del bucket (52428800) coinciden con lo observado. En el local tampoco hizo falta la cabecera `apikey` (con solo `Authorization` de admin completó); la spec la manda igual, que es lo seguro para la nube (no verificado) |

## Hallazgos adicionales

- **Token vencido en mitad de la subida (criterio 8).** Creado con un token válido, el 2.º PATCH con un JWT vencido (firmado con el secret local) da
  `HTTP 400` con cuerpo JSON `{"statusCode":"403","code":"AccessDenied","error":"Unauthorized","message":"\"exp\" claim timestamp check failed"}`.
  No es 401 ni 403: el status HTTP es **400** y el código real está en el cuerpo. Igual con un token con firma inválida. El upload creado queda abierto.
- **Mensajes de rechazo.** 403 (RLS), 413 y 415 llegan como texto plano con el status HTTP real; el 400 de autenticación llega como JSON. En
  `tus-js-client` el status está en `error.originalResponse.getStatus()` y el cuerpo en `getBody()`; el mensaje de `error` también incluye el texto.
- **Reintento y `HEAD` implícito.** Tras un error, tus siempre hace `HEAD` antes del siguiente `PATCH`; el reintento retoma desde el offset que informa el servidor
  (observado en f1 y f2). Un PATCH aplicado cuya respuesta se perdió debería resolverse igual por el `HEAD`, pero ese caso exacto no se reprodujo.
- **El progreso adelanta al servidor.** `onProgress` cuenta bytes escritos al socket, no confirmados: con 6 MiB por trozo llega al 100 % del trozo antes de
  que el servidor responda, y si se corta, el progreso retrocede al offset del `HEAD`. `onChunkComplete` sí es confirmación. En un corte real la barra
  puede bajar.
- **Trozos de 1 MiB funcionan en el local** (3 MiB en 3 PATCH): el `FileStore` no impone tamaño de parte. La regla de 6 MiB de la nube
  (S3 multipart) **no se verifica acá**.
- **Los incompletos y `db:reset`.** `db:reset` reinicia la base pero el backend de archivos del contenedor de storage conserva los archivos subidos
  (y los fragmentos de TUS) en `/mnt/stub/stub/<bucket>/…`. No afecta a la app.

## Impacto en la spec

No se edita la spec; esto es lo que hay que ajustar o completar.

1. **Criterio 3 y diseño (`onShouldRetry`): el rechazo por token vencido es HTTP 400, no 401.** La lista «los demás 4xx (401, 403, 413, 415) son
   definitivos» sigue valiendo si se lee «todo 4xx salvo 409 y 423», pero hay que escribirla así y no enumerar 401. El `onBeforeRequest` con
   `getSession()` en cada trozo (criterio 8) es imprescindible: un token vencido a mitad de la subida no se recupera con reintentos.
2. **Diseño (`subirReanudable` rechaza con `{ statusCode }`).** `codigosDeError` ya lee `status` y `statusCode` como cadenas o números, así que alcanza con
   rechazar `{ status, statusCode }` con el status HTTP real (413, 415, 403, 409…). Para el 400 de autenticación hay que parsear el cuerpo JSON y tomar
   `statusCode` (`'403'`) si se quiere un código útil; con texto plano (413, 415, 403) no hay nada que parsear. El mensaje de `errores.ts` para 413/415 se
   mantiene, y esos dos llegan **al crear**, sin bytes enviados, lo que simplifica el criterio 5 (el lote sigue sin haber subido nada).
3. **Criterio 3, mención del 409.** Quedó medido: el 409 en la creación es «la ruta ya existe» (`x-upsert: false`) y, en un `PATCH` o `DELETE` sobre un
   upload completo, también 409 con el mismo texto. Un 409 en el PATCH final significa que el objeto ya está; como tus hace `HEAD` antes de reintentar y ahí
   `Upload-Offset` = `Upload-Length`, debería cerrar en éxito (inferido, no reproducido). El 423 no se observó en ninguna prueba (ni tras cortar la conexión ni tras `abort`).
4. **Criterio 6 (`abort`).** `abort(true)` siempre resolvió rápido (10-20 ms) con `DELETE 204`, también con un PATCH en vuelo, y el upload desaparece
   (`HEAD` 404). Hace falta el `.catch` de la spec, pero en el local el caso `DELETE` fallido no se dio. `abort(false)` deja un upload incompleto.
5. **«Fuera de alcance» / Diseño (incompletos): corregir el texto.** Está medido en el local que un upload incompleto **no es un objeto, no figura en
   `storage.list` ni en `storage.objects` y `npm run storage:limpiar` no lo ve**. La retención **no se pudo medir**: el local no vence nunca los
   incompletos (sin `deleteExpired` invocado), y la nube (S3) es otro mecanismo con un vencimiento que habría que confirmar con el proveedor. Dos
   consecuencias para la spec: (a) cancelar tiene que usar `abort(true)` (con DELETE), no `abort(false)`; (b) los fallos que dejan el upload abierto
   (reintentos agotados, pestaña cerrada, token vencido) lo dejan hasta que el servidor lo venza, y esa cola no está cubierta por #28.
6. **Verificación de punta a punta.** El paso 6 («`storage:limpiar` en simulación: no informa huérfanos nuevos») sigue siendo cierto, pero no prueba
   que no queden incompletos. Para el e2e y la verificación manual, agregar que tras cancelar el `HEAD` del upload responde 404.
7. **Pruebas.** El e2e de la spec (buffer de ~13 MiB, `page.route` sobre el endpoint de TUS) es viable: `Location` y `Upload-Offset` están expuestos y los
   trozos y offsets son los esperados (6 MiB, 12 MiB, 13 MiB). Los tests no deberían depender de que `onProgress` sea monótono ante un corte (retrocede).
   Como el e2e corre contra el `FileStore` local, **no cubre** el comportamiento de S3 en la nube (parte de 6 MiB obligatoria): conviene probar al menos una
   subida de ~13 MiB contra el proyecto de demos antes de dar por cerrada la feature.
8. **Observación de seguridad menor (fuera de alcance).** `HEAD` sobre un upload devuelve 200 y sus metadatos **sin** `Authorization`, si se conoce la
   URL (es el `objectName` en base64 más un id). La escritura sí exige RLS (verificado con un PATCH de un usuario sin permiso: 403; el DELETE sin
   credenciales no se probó). Lo expuesto es la ruta del objeto, que contiene un `uuid` aleatorio. No requiere acción en esta feature.
9. **Sin cambios en base, bucket, políticas ni `config.toml`**, como dice la spec.
