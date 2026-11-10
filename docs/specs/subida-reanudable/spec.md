# Subida reanudable y barra de progreso

- **Estado:** aprobada
- **Autor:** Emily Kohler + Claude
- **Fecha:** 2026-11-10 (issue #29)

## Objetivo
El admin sube archivos de hasta 50 MiB a un taller (alta y reemplazo) y hoy no ve avance, no puede cancelar y un corte de red lo obliga a empezar de cero. Pasa a subir por TUS: progreso real, reintentos automáticos que retoman donde quedó y cancelación por archivo.

## Criterios de aceptación
1. Dado un archivo válido, cuando se sube, entonces su fila muestra una barra con el porcentaje y los MB subidos, que avanza hasta 100 %, y al terminar se crea el recurso como hoy (sube → inserta, ADR 0016).
2. Dado un lote de varios archivos, cuando se suben, entonces va de a uno, en orden; los que esperan dicen «En espera» y cada uno tiene su propia barra.
3. Dada una subida en curso, cuando se corta la red y vuelve con la pestaña abierta, entonces se reintenta sola con espera creciente y retoma desde el último trozo confirmado, sin repetir lo ya subido. Mientras reintenta la fila dice «Sin conexión, reintentando…». Los reintentos cubren cortes (status 0), 5xx y 423, durante unos 2 minutos, y no dependen de `navigator.onLine`; todo 4xx es definitivo y no se reintenta, incluido el 409 (significa «el objeto ya existe»). Si el HTTP es 400 con un cuerpo JSON que trae `statusCode`, se usa ese (así llega un token vencido, que es un 403 definitivo). Medido en el paso 0 (`poc.md`).
4. Dada una subida que agotó los reintentos, entonces la fila queda en error con un mensaje claro; no se crea ninguna fila de `recurso`. Para volver a intentar se vuelve a elegir el archivo (sin botón «Reintentar»).
5. Dado un archivo que el servidor rechaza (413 por tamaño o 415 por tipo, ambos al crear el upload, antes de enviar bytes), entonces se muestran los mismos mensajes que hoy (`errores.ts`) y el lote sigue.
6. Dada una fila subiendo o en espera, cuando el admin pulsa «Cancelar», entonces se aborta el upload en el servidor, no se inserta fila y el resto del lote sigue. Cuando ya se enviaron todos los bytes la fila dice «Finalizando…» y «Cancelar» desaparece: el servidor puede haber completado el objeto, que quedaría huérfano y limpia `npm run storage:limpiar` (ADR 0016).
7. Dado un reemplazo de archivo, entonces muestra la misma barra y el mismo «Cancelar»; si se cancela, la fila queda con su archivo anterior.
8. Dada una subida que dura más que el access token (1 h), entonces cada trozo usa el token vigente y no falla con 401.
9. Dada una subida en curso, cuando se intenta cerrar o recargar la pestaña, entonces el navegador pide confirmación (`beforeunload`). Si se recarga igual, se empieza de nuevo: no se retoma entre pestañas. Si el admin navega a otra pantalla de la app, las subidas en curso se abortan (al desmontar la página); no se bloquea la navegación, para no estorbar el cierre por inactividad.
10. Accesibilidad: la barra es un `<progress>` con nombre (el del archivo); un único `role="status"` siempre montado anuncia inicio, fin, «reintentando» y error de cada archivo, **no** cada porcentaje (los errores siguen en `Alerta` y no se duplican); «Cancelar» se opera con teclado y, al terminar una fila, el foco va al botón del dropzone o al «Reemplazar» de esa fila (test `toHaveFocus()`).

## Diseño
- `package.json`: dependencia `tus-js-client` (MIT; al instalar, `npm audit` y comprobar que no arrastre código solo de Node al bundle). Import estático: `RecursosPage` ya es `lazy` (`router.tsx:33`).
- **Paso 0 del plan: prueba de concepto contra el Supabase local**, antes de construir: CORS (`Location`, `Upload-Offset`), permiso al crear con la política de insert del admin, 413 y 415 reales por HTTP, `DELETE`, `HEAD` de un upload ya completo, y cuánto retiene el servidor un upload incompleto. Si algo falla, se vuelve a esta spec.
- `src/shared/lib/subidaReanudable.ts` (nuevo): `subirReanudable(bucket, ruta, file, mime, { onProgress, onReintento, signal })`. Endpoint `<VITE_SUPABASE_URL>/storage/v1/upload/resumable`, trozos de 6 MiB, metadatos `bucketName`, `objectName`, `contentType`, `cacheControl`, cabeceras `x-upsert: false` y `apikey`, `storeFingerprintForResuming: false`. `onBeforeRequest` toma el access token de `getSession()` en cada trozo (sesión nula: lanza y se trata como corte; `Authorization` solo ahí). `onShouldRetry` propio (criterio 3, función pura con test) y `retryDelays` de ~2 min. Rechaza con `{ statusCode }`, que ya entiende `codigosDeError`, y con un `AbortError` aparte para cancelar; `abort(true)` lleva `.catch`. Ante un error definitivo o reintentos agotados llama también a `abort(true)` (mejor esfuerzo, con `.catch`) para borrar el upload incompleto: no es un objeto y `storage:limpiar` no lo ve. El progreso nunca retrocede: `onProgress` cuenta bytes escritos al socket y baja tras un corte, así que se muestra `max(anterior, actual)`, y `onChunkComplete` fija el piso confirmado. `storage.ts` y `subirArchivo` no cambian: los usan normativas y `compensar`.
- `src/features/recursos/consultas.ts` y `secuencias.ts`: `subirArchivo` suma opciones opcionales (los mocks actuales siguen valiendo); `altaArchivo` y `reemplazarArchivo` reciben `{ onProgress, onReintento, signal }`. El orden de operaciones y `compensar` no cambian: el objeto existe solo cuando el upload completa, y si el insert o el update falla, se compensa como hoy. `errores.ts` no cambia.
- `hooks/useRecursos.ts`: `EstadoArchivo` suma `progreso` (entero de 0 a 100; no se actualiza si no cambió), `'reintentando'`, `'finalizando'` y `'cancelado'`; `useAltaArchivos` expone `cancelar(indice)` con un `AbortController` por archivo y aborta todo al desmontar. `useReemplazarArchivo` expone progreso y cancelación.
- `src/features/recursos/components/ProgresoSubida` (nuevo): `<progress>`, texto «12,4 de 38,0 MB (33 %)» (con `formatearTamanio`, que usa base 1024 e imprime «MB» como el resto de la app) y botón «Cancelar». Lo usan el alta y el reemplazo en `RecursosPage`.
- Pruebas: Vitest con `vi.mock('tus-js-client')` (clase falsa) y funciones puras. E2e con un buffer de ~13 MiB (tres trozos) y `page.route` sobre el endpoint de TUS: abortar una vez un PATCH y comprobar `Upload-Offset` > 0 después, demorar uno para ver progreso y «reintentando», y cancelar durante la demora.
- Decisiones de la entrevista: TUS para todos los tamaños; sin retomar tras recargar; cancelar por archivo. Documentar en `docs/arquitectura.md` y una nota en 0016. No hace falta un ADR nuevo.

## Fuera de alcance
- Retomar tras recargar o entre pestañas; pausar y reanudar a mano; subir varios archivos en paralelo.
- Normativas (bucket público, PDF de hasta 20 MiB) y el logo: siguen con `subirArchivo`.
- Cambios en la base, el bucket o las políticas (TUS usa las mismas de `storage.objects`).
- Un upload incompleto no es un objeto y `npm run storage:limpiar` no lo ve; ocupa espacio hasta que el servidor lo expire (no verificado: lo mide el paso 0).
- Botón «Reintentar» por archivo (se vuelve a elegir el archivo).

## Verificación de punta a punta
1. `npm run db:start`, entrar como admin, abrir un taller → Recursos.
2. Subir un MP4 de ~40 MiB: ver la barra avanzar y, al terminar, el recurso en la lista.
3. A mitad, cortar la red del navegador (DevTools → Offline) y volverla dentro de ~2 minutos: la fila dice «Sin conexión, reintentando…» y retoma.
4. Subir tres archivos y cancelar el segundo mientras espera y el primero mientras sube: el resto sigue.
5. Reemplazar un archivo y cancelar: queda el anterior. Intentar cerrar la pestaña con una subida en curso: pide confirmación.
6. `npm run storage:limpiar` en simulación: no informa huérfanos nuevos. Regresión: `npm run test:e2e`, `npm test`, `lint`, `typecheck`.
7. **Manual, antes de cerrar la feature (la hace una persona):** subir un archivo de ~13 MiB al proyecto de **demos** en la nube (Storage S3, que exige trozos de 6 MiB; el local usa el backend de archivos y acepta trozos de 1 MiB, así que el e2e local no lo cubre). Nunca la base de producción.
