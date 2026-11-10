# Revisión 1

Diff sin commitear de `feat/subida-reanudable` contra main, revisado contra `spec.md` (aprobada, #29), `critica.md` (Respuesta) y `poc.md`.
Lo que digo de `tus-js-client` sale de leer `node_modules/tus-js-client/lib.esm/upload.js` (4.3.1). El perfil del revisor no deja escribir un
test propio, así que los dos primeros hallazgos salen de seguir el código a mano.

## Veredicto
Cambios necesarios

## Problemas

- **[importante]** `src/pages/admin/talleres/RecursosPage.tsx:105-112` y `:143-147`: `anuncioDeSubida` toma como «último terminado» el
  último **por posición** en la lista (`findLast`), no el último en el tiempo. Así el `role="status"` pierde el fin de archivos y el
  criterio 10 («anuncia inicio, fin, … de cada archivo») no se cumple en dos flujos comunes:
  1. Lote `[A, B, C]` en el que se cancela C mientras espera: el status dice «C cancelado. Subiendo A». Cuando A termina,
     `findLast` sigue dando C y el texto pasa a «C cancelado. Subiendo B». «A subido» no se anuncia nunca.
  2. Un reemplazo terminado y después un lote de alta: el hito del reemplazo se agrega **al final** (`:146`) y `reemplazo` no se limpia
     nunca. Con X subiendo el status dice «R subido. Subiendo X», y cuando X termina queda en «R subido», el mismo texto de antes.
     Ni el fin, ni la cancelación, ni el error de X se anuncian, y lo mismo pasa con todos los lotes siguientes.

  Ningún test lo ve: el de anuncios (`RecursosPage.test.tsx`, «anuncia el inicio, el fin y la cancelación…») solo recorre un lote en
  orden. **Arreglo:** registrar el último hito terminado por orden de llegada. Por ejemplo, el hook guarda el índice del último que pasó a
  `listo`, `cancelado` o `error`, y la página guarda el resultado del reemplazo con un contador o una marca de tiempo y se queda con el
  más reciente. Alternativa mínima: limpiar `reemplazo` al empezar un lote. Sumar tests para los dos flujos (cancelar uno que espera y
  después terminar el anterior; reemplazo y después alta), comprobando que aparezca «A subido» y «X subido».

- **[importante]** `src/shared/lib/subidaReanudable.ts:54-60` y `:110`, con `src/features/recursos/hooks/useRecursos.ts:200`: `abort(true)`
  llama a `BaseUpload.terminate(url, this.options)` (`upload.js:429`). Si el DELETE falla con status 0 o 5xx, `terminate` lo reintenta
  con las mismas `retryDelays`, unos 2 minutos, pasando por **nuestro** `onShouldRetry` (`upload.js:886` → `:1033`), y ese
  `onShouldRetry` llama a `onReintento` cada vez. Esto ocurre justo en los casos de la spec: reintentos agotados con la red caída
  (`onError` → `descartar`), o cancelar sin red. En el alta, `onReintento` es `marcar(i, { estado: 'reintentando' })`, y `marcar` lee
  `actuales.current`, que para entonces es el **lote siguiente**. Si el admin vuelve a elegir el archivo (que es como se reintenta según
  el criterio 4), la fila `i` del lote nuevo pasa a «Sin conexión, reintentando…», aunque esté subiendo bien o todavía en espera, y el
  status anuncia un reintento falso. Un archivo en espera marcado así tampoco se cancela al momento (`cancelar` solo marca si dice
  `esperando`). El reemplazo no tiene el problema porque filtra con `vigente()`.
  **Arreglo** en `subirReanudable`: un `let vigente = true` que pasa a `false` en `onSuccess`, `onError` y `alCancelar`, y
  `onShouldRetry: (e) => onShouldRetry(e, vigente ? onReintento : undefined)`. Test: tras `o.onError(...)` o `control.abort()`,
  `o.onShouldRetry(error(null), 0, {})` no llama a `onReintento`.

- **[importante]** `src/shared/lib/subidaReanudable.ts:28-33`: el criterio 3 dice «Si el HTTP es 400 con un cuerpo JSON que trae
  `statusCode`, se usa ese». Ese texto está dentro del criterio de reintentos, pero el código solo lo aplica al rechazo (`statusDelError`).
  La decisión de reintentar mira el HTTP, así que un 400 con `statusCode` `"503"` o `"423"` en el cuerpo nunca se reintenta. Para el token
  vencido (403 en el cuerpo) el resultado es el mismo, por eso los tests pasan. La diferencia aparece solo si storage-api envuelve un 5xx o
  un 423 en un 400 (no medido en `poc.md`). **Arreglo:** que `onShouldRetry` decida con `Number(statusDelError(error))`. Tests: 400 con
  cuerpo `{"statusCode":"503"}` reintenta; 400 con `{"statusCode":"403"}` y 400 sin JSON no reintentan. Si la intención era otra, que se
  corrija la spec.

- **[importante]** `src/features/recursos/hooks/useRecursos.ts:51-52, 200` y `src/features/recursos/components/ProgresoSubida.tsx:25`
  (criterio 6, caso borde): «Cancelar» se oculta solo en `finalizando`. Si el último PATCH se corta después de haber escrito el 100 % al
  socket, el progreso queda en 100 (por el `max`) y `onReintento` pasa la fila a `reintentando`, así que «Cancelar» **vuelve a aparecer**
  con todos los bytes ya enviados. Es el caso que el criterio quiere evitar: si el servidor aplicó el PATCH y se perdió la respuesta, el
  objeto existe y cancelar lo deja huérfano. El impacto queda dentro de lo que acepta 0016 (lo limpia `storage:limpiar`). **Arreglo:**
  ocultar «Cancelar» cuando `progreso >= 100` sea cual sea el estado (en `ProgresoSubida`, o no volver a `reintentando` con
  `progreso === 100`), con su test. Si se prefiere no tocarlo ahora, que quede como issue.

## Criterios de aceptación

| # | Implementado | Test que falla sin el código |
|---|---|---|
| 1 | Sí: `<progress>`, «X de Y MB (n %)» con `formatearTamanio`, y sube → inserta sin cambios | `ProgresoSubida.test`, `RecursosPage.test` «barra (criterio 1)», `secuencias.test` (orden y `compensar`) |
| 2 | Sí: de a uno, «En espera» y una barra por archivo | `RecursosPage.test` «lote (criterio 2)», `useRecursos.test` (orden de llamadas) |
| 3 | Sí, con el desvío del 400 + `statusCode` (problema 3): 0, 5xx y 423 sin `navigator.onLine`, todo 4xx definitivo, ~129 s | `subidaReanudable.test` («onShouldRetry (pura)», «no mira navigator.onLine», reintentos ~2 min), estado `reintentando` en hook y página. Retomar sin repetir lo hace la librería: lo cubre el e2e (qa) |
| 4 | Sí: error con el mensaje de `errores.ts` (genérico para 5xx), sin fila y sin «Reintentar» | `secuencias.test` (503 sin fila ni compensación), `RecursosPage.test` «errores» |
| 5 | Sí: 413 y 415 dan `{ statusCode }` y los mensajes de siempre; el lote sigue | `subidaReanudable.test` (it.each 413/415), `useRecursos.test` (415 → «formato» y el lote sigue), página (413 → «tamaño») |
| 6 | Sí: `abort(true)` con `.catch`, sin fila, el lote sigue, «Finalizando…» sin «Cancelar»; caso borde en el problema 4 | `subidaReanudable.test` (cancelación), `useRecursos.test` y `RecursosPage.test` «cancelar» |
| 7 | Sí: misma barra en la fila; al cancelar queda el archivo anterior y no hay alerta | `RecursosPage.test` «reemplazo (criterio 7)», `secuencias.test` (cancelado no actualiza ni borra) |
| 8 | Sí: `getSession()` en cada `onBeforeRequest`; con sesión nula lanza (tus lo toma como status 0) | `subidaReanudable.test` «token vigente en cada petición» |
| 9 | Sí: `beforeunload` solo con una subida en curso, y abortar al desmontar (alta y reemplazo) | `RecursosPage.test` «cerrar o recargar», `useRecursos.test` «al desmontar…» |
| 10 | Parcial: `<progress>` con nombre, un único `status` siempre montado, sin `aria-live` en la lista, foco con `toHaveFocus()`, teclado en «Cancelar». Pierde anuncios (problema 1) | `ProgresoSubida.test` (teclado), `RecursosPage.test` «anuncios» y «foco» |

## Qué verifiqué

- **Tests existentes modificados.** No hay ninguno debilitado. En el bloque «durante un lote de subida», y en el de alta, la espera pasó
  de `findByText(/subiendo/i)` a `findByRole('progressbar', { name: 'uno.pdf' })`. El texto «Subiendo» ya no es visible (quedó en el
  `status` sr-only), y la barra con nombre es una condición más estricta de «hay una subida en curso». Lo que se afirma después
  (botones deshabilitados, aviso «esperá») no cambió. En `useRecursos.test` se sumó `expect.anything()` como argumento de opciones, que
  es consecuencia directa de la firma nueva.
- **Seguridad.** `Authorization` solo en `onBeforeRequest`. `headers` lleva `x-upsert: 'false'` y `apikey` (la clave publicable), y el
  test lo comprueba. No hay `console.*` y el token no se guarda. Con `storeFingerprintForResuming: false`, `_saveUploadInUrlStorage`
  vuelve sin escribir (`upload.js:840`), `findPreviousUploads` no se llama y `_removeFromUrlStorage` no hace nada sin clave: no se toca
  `localStorage`. El endpoint se arma solo con `VITE_SUPABASE_URL`. Los metadatos van en base64 (`encodeMetadata`) y la ruta sale de
  `rutaNueva` (`<taller>/<uuid>.<ext>` con la extensión de la tabla `FORMATOS`): no hay inyección. El `message` de `DetailedError` no
  incluye cabeceras y no se muestra (`mensajeDeErrorRecurso` solo mira códigos). No hay cambios en base, bucket ni políticas.
- **ADR 0016.** El orden sube → inserta y sube → actualiza → borra el viejo no cambió, y `compensar` solo recibe errores del insert o
  del update. Una cancelación o un fallo de subida no insertan fila ni compensan (`secuencias.test`).
- **Estados.** Cancelar con el signal ya abortado rechaza sin `start()`. Después de `onSuccess` el listener se quita, así que abortar
  tras completar no hace nada. Una segunda cancelación es un no-op (`once` más `AbortController`). Cancelar uno en espera lo marca al
  instante y el `for` lo saltea. Al desmontar se aborta todo y no arranca lo que esperaba. Un 400 con `statusCode` 403 en el cuerpo
  rechaza con `'403'`. Con reintentos agotados se llama a `onError` y a `abort(true)` (problema 2 por su efecto lateral). Un `onError`
  que llega después de abortar no se emite (`_aborted`, `upload.js:445`).
- **Accesibilidad.** Un único `<p role="status">` siempre montado, fuera de la lista y sin porcentajes. La lista no tiene `aria-live`. El
  error se anuncia sin el motivo en el `status` y con el motivo solo en la `Alerta`. «Cancelar» tiene nombre «Cancelar la subida de X» y
  responde a Enter. El foco va al input del dropzone o al «Reemplazar» solo si cayó en `<body>`. El dropzone tiene anillo
  `has-[input:focus-visible]`. `FileDropzone` solo cambió el ref interno por la prop opcional `inputRef`; `NormativaFormPage` no la pasa
  y sigue igual.
- **Desvíos que reportó el implementador.** Las sobrecargas de `secuencias.ts` (con o sin `Required<OpcionesSubida>`), el nombre
  visible en `ProgresoSubida` y el aviso «esperá» durante un reemplazo no son un problema. El status que suma el último terminado sí lo
  es (problema 1).
- **`consultas.ts` editado con un script.** Pasa `npm run lint` y no tiene avisos propios (los 4 avisos son de archivos que el diff no
  toca). El estilo coincide con el resto (comillas simples, sin `;`, orden de imports). No pude correr el formateador: el perfil lo bloquea.
- **Dependencia.** `tus-js-client` 4.3.1, MIT, en `dependencies`. El lock suma 20 paquetes, todos MIT salvo `js-base64` (BSD-3-Clause)
  y `custom-error-instance` y `signal-exit` (ISC); `combine-errors` es MIT según su `License.md`. `url-parse` está en 1.5.10, la versión
  con los avisos conocidos ya corregidos. `npm audit` y `npm run build` están bloqueados para el revisor. El audit y el bundle sin
  código de Node figuran en `poc.md`. **El coordinador debería correr `npm run build` y `npm audit`.**
- **Alcance.** Normativas y el logo siguen con `shared/lib/storage`, que no cambió. `docs/arquitectura.md` y la nota de 0016
  coinciden con el código. También cambiaron las memorias del crítico (`.claude/agent-memory/critico/`), que no son código.

## Evidencia

```
$ npm run lint
> oxlint
4 warnings (react(incompatible-library) en DescargaModal, TallerFormPage y ConfiguracionPage; only-export-components en AuthContext),
todos en archivos fuera del diff. exit 0.

$ npm run typecheck
> tsc -b
(sin errores)

$ npm test
 Test Files  102 passed (102)
      Tests  1770 passed (1770)
   Duration  35.15s

$ npm run build / npm audit
Bloqueados por el perfil del revisor (roles.mjs). Que los corra el coordinador.
```

No se corrió el e2e ni Playwright (le toca a `qa`).
