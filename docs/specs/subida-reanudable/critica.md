# Crítica de la spec: subida reanudable (#29)

No reabro lo que se decidió en la entrevista: TUS para todos los tamaños con `tus-js-client`, sin retomar tras recargar y cancelar por archivo. Tampoco
reabro 0016. El orden alta/reemplazo/baja de 0016 y `compensar` siguen valiendo tal como dice la spec: `compensar` solo recibe errores del insert o
del update (PostgREST), nunca uno de TUS. Por eso que los errores de TUS no tengan `code` (contexto §5) no importa ahí.

Límite de la verificación: el perfil del crítico no deja usar `docker`, `npm view` ni `gh`, y `tus-js-client` no está en `node_modules`. Lo que digo
de la librería sale de su código fuente (`lib/upload.js`, v4) y hay que confirmarlo en `node_modules` al instalarla. Lo que digo de storage-api
queda **a verificar** (punto 2).

## Veredicto
Hay mejoras

Si solo se cambia una cosa: el `onShouldRetry` por defecto de tus-js-client **no reintenta sin conexión** (`navigator.onLine === false`). Así, el
criterio 3 falla justo con la prueba que propone la spec (DevTools → Offline o `context.setOffline`). Hace falta un `onShouldRetry` propio y un
estado `reintentando`.

## Puntos

1. **El criterio 3 no se cumple con la configuración por defecto (alta).** En tus-js-client, `defaultOnShouldRetry` es
   `(!inStatusCategory(status, 400) || status === 409 || status === 423) && isOnline()`, y `isOnline()` devuelve `false` si `navigator.onLine === false`.
   Con DevTools Offline (paso 3 de la verificación) o `context.setOffline(true)` (molde: `e2e/signout-sin-red.spec.ts:32`), la primera falla se emite
   como error definitivo sin reintentar. Además, la librería no tiene un evento «estoy reintentando», y `EstadoArchivo` (spec, Diseño) solo suma
   `progreso` y `'cancelado'`: no hay de dónde sale «Sin conexión, reintentando…». Por último, los `retryDelays` por defecto (`[0, 1000, 3000, 5000]`)
   suman 9 s, y cualquier corte real los agota.
   **Alternativa:** en `subirReanudable`, un `onShouldRetry(err, intento)` propio que devuelva `status === 0 || status >= 500 || status === 409 || status === 423`
   **sin** mirar `navigator.onLine`, y que antes de devolver `true` llame a `onReintento()`. El estado vuelve a `subiendo` con el próximo `onProgress`.
   Sumar `'reintentando'` a `EstadoArchivo`. Usar `retryDelays` de unos 2 minutos en total (p. ej. `[0, 1000, 3000, 5000, 10000, 20000, 30000, 60000]`).
   La librería pone el contador en cero cuando hubo avance (`_offset > _offsetBeforeRetry`), así que un corte por trozo no gasta todo.
   Sobre los 4xx: el filtro de arriba ya los deja afuera, así que un 401, 403, 413 o 415 no entra en bucle. Hay que conservar ese filtro al escribir
   el propio.
   **Qué se gana:** el criterio central de la feature funciona, y queda una distinción explícita entre reintentando (0, 5xx, 409, 423) y definitivo (otros 4xx o reintentos agotados).

2. **El diseño entero descansa en supuestos de storage-api sin comprobar (alta).** Ni el contexto ni la spec verificaron estos puntos, y el crítico no
   puede hacerlo sin `docker`:
   - (a) Kong local y el alojado aceptan `POST/PATCH/HEAD/DELETE` en `/storage/v1/upload/resumable` con el JWT del admin, y el CORS expone `Location`,
     `Upload-Offset` y `Tus-Resumable` (sin `Location`, tus-js-client falla al crear).
   - (b) El permiso se chequea al crear con la política `talleres_objetos_insert_admin`, y la fila de `storage.objects` se crea al completar, antes del
     204 del último PATCH.
   - (c) El tope del bucket (52428800) se aplica por `Upload-Length` al crear y devuelve un **status HTTP** 413. Por REST, en cambio, viaja como
     `status 400` + `statusCode`, ver `src/shared/lib/erroresStorage.ts:2-5`.
   - (d) `allowed_mime_types` se valida contra el metadato `contentType` y da 415.
   - (e) `DELETE` (que manda `abort(true)`) está soportado.
   - (f) Un `HEAD` sobre un upload ya completado responde `offset == length` o un 404.
   - (g) Si el gateway alojado exige el header `apikey` (supabase-js siempre lo manda).

   Los nombres de metadatos (`bucketName`, `objectName`, `contentType`, `cacheControl`), `x-upsert: false` y los trozos de 6 MiB coinciden con la guía
   de Supabase. `config.toml` no necesita nada: TUS viene activo y `file_size_limit = "50MiB"` (l.120) es el tope global.
   **Alternativa:** que la primera tarea del plan sea una prueba de concepto contra el Supabase local que deje fijado cada punto, como en recursos.
   Puede ser un e2e mínimo o un script con service_role para el tope y el MIME. Mandar también `apikey: VITE_SUPABASE_PUBLISHABLE_KEY` en `headers`,
   que no cuesta nada.
   **Qué se gana:** si falla (a) o (d), se descubre antes de escribir hooks y componentes.

3. **«Reintentar» por archivo es la pieza más cara y la que menos rinde (media, cerca de alta).** La spec (Diseño, hooks) lo expone como
   `reintentar(indice)` sobre un lote que corre en un `for` (`useRecursos.ts:104-112`), y quedan sin definir dos cosas:
   - Si se pulsa mientras el lote sigue, o arranca otra subida en paralelo (rompe «de a uno», criterio 2) o hay que convertir el `for` en una cola
     con reencolado.
   - Si se reintenta con un `altaArchivo` nuevo, arranca de cero con otra ruta. Eso es lo mismo que volver a elegir el archivo, y además deja el upload
     anterior incompleto en el servidor.

   Con el punto 1, que los reintentos automáticos se agoten pasa a ser raro.
   **Alternativa:** sacar «Reintentar». La fila en error dice el motivo y el admin vuelve a elegir el archivo cuando el lote termina, como hoy
   (`RecursosPage.tsx:101-104`). Si se quiere conservar, que retome el mismo `Upload` con `upload.start()`, que guarda `url` y sigue desde el offset
   del servidor. Eso obliga a que `subirReanudable` devuelva un control (`{ promesa, reanudar, cancelar }`) en lugar de una promesa, y no me parece que
   valga la pena para un solo admin.
   **Qué se gana:** el hook queda en un `for` con un `AbortController` por archivo, sin cola ni estados cruzados. Es el recorte que da el 90 % del valor.

4. **«Cancelar no deja un huérfano» (criterio 6) no es cierto en la carrera con el último trozo, y hay un caso de 409 en bucle (media).**
   - Si se cancela con el último PATCH en vuelo, el servidor puede completar y crear el objeto. `abort(true)` corta la XHR y manda un DELETE sobre un
     upload ya terminado, con un resultado que depende de storage-api (2.e). El cliente no inserta fila, así que queda un objeto huérfano que
     `storage:limpiar` sí ve (lista `storage.objects`, `scripts/limpiar-storage.ts:48-55`), o algo peor si el DELETE borra datos y no la fila.
   - Si se pierde la respuesta del último PATCH, tus-js-client reintenta con un `HEAD`. Si ese HEAD da 4xx, `_resumeUpload` borra `url` y crea un
     upload nuevo. El POST con `x-upsert: false` da 409, y el 409 **se reintenta por defecto**: cinco intentos inútiles, después error genérico y un
     huérfano. Es aceptable según 0016, pero conviene no prometer otra cosa.
   - `abort(true)` devuelve una promesa que rechaza si el DELETE falla. Sin `catch`, queda un rechazo sin manejar.

   **Alternativa:**
   - Ocultar «Cancelar» cuando `bytesEnviados === total` (estado «Finalizando…»).
   - `abort(true).catch(() => {})`: un upload incompleto no es un objeto, así que no queda nada que avisar.
   - En el `onShouldRetry` del punto 1, no reintentar un 409 de la creación. La ruta es un uuid nuevo, así que un 409 solo puede venir de la propia subida.
   - Reescribir el criterio 6: «cancelar antes del último trozo no deja objeto; si el servidor ya completó, queda un huérfano (0016)».

   **Qué se gana:** el criterio se puede probar, y el único modo de falla sigue siendo el que acepta 0016.

5. **`errores.ts` de recursos pasaría a conocer TUS (media).** La spec propone leer `originalResponse.getStatus()` en
   `src/features/recursos/errores.ts`. Eso acopla el dominio a la librería, y el día que normativas o el logo usen TUS habría que repetirlo.
   **Alternativa:** que `subirReanudable` (en `shared/lib`) rechace con un objeto normalizado `{ statusCode: String(status), message }`, que ya entiende
   `codigosDeError` (`erroresStorage.ts:6-9`). Una cancelación se rechaza con un `DOMException('AbortError')` aparte, para que el hook marque
   `'cancelado'` y no `'error'`. Así `errores.ts` no cambia.
   **Qué se gana:** un solo punto que conoce TUS y cero cambios en los mensajes del dominio.

6. **Accesibilidad: la lista actual anunciaría cada porcentaje, y el foco y los errores quedan sin definir (media).**
   - Hoy la lista en curso es `<ul aria-live="polite">` y se monta condicionalmente (`RecursosPage.tsx:155-163`). Si las barras y el texto
     «12,4 de 38,0 MiB» quedan adentro, el lector anuncia cada cambio, y por montarse con texto, el primer anuncio no es confiable (`.claude/rules/react.md`).
   - Los errores ya salen en `Alerta` con `role="alert"` (`:164`, `:288-297`). Si el `status` también anuncia el error, se dice dos veces.
   - El criterio 10 pide que el foco no se pierda, pero no dice adónde va. Al terminar o cancelar, el botón «Cancelar» enfocado desaparece, en el alta
     y en el reemplazo.

   **Alternativa:**
   - Sacar `aria-live` de la lista.
   - Un único `<p role="status">` siempre montado fuera de la lista, que cambie solo en hitos: «Subiendo X», «X subido», «X cancelado». Los errores
     siguen solo en `Alerta`.
   - Al desmontarse un «Cancelar» que tenía el foco, llevar el foco al botón del `FileDropzone` (alta) o al «Reemplazar» de esa fila (reemplazo).
   - Test con `toHaveFocus()`.
   - `<progress max={total} value={enviados} aria-label={nombre}>`.

   **Qué se gana:** se cumple la regla del proyecto sin un componente nuevo de anuncios.

7. **Navegar dentro del SPA o el cierre por inactividad dejan la subida corriendo sin control (media).** `beforeunload` (criterio 9) no salta en una
   navegación con React Router. Si el admin toca una miga de pan, o `AdminLayout` cierra la sesión por inactividad y navega al login, `Pantalla` se
   desmonta y el `Upload` sigue vivo. Con sesión, termina e inserta sin que nadie vea el resultado. Sin sesión, `onBeforeRequest` no tiene token, la
   subida falla por 401 y queda incompleta.
   **Alternativa:** en el hook, un cleanup de desmontaje que aborte todos los `AbortController`. Es coherente con «sin retomar» y no deja nada. No usar
   `useBlocker`: bloquearía también el `Navigate` al login del cierre por inactividad.
   **Qué se gana:** el comportamiento al salir es uno solo, definido y probable con `unmount()`.

8. **El e2e con un archivo de unos 40 MiB y un corte real de red va a ser lento y frágil (media; ver #61).** Con `setOffline`, además, choca con el
   punto 1. Y en local, 40 MiB sube en menos de un segundo, así que «ver la barra avanzar» no se puede afirmar.
   **Alternativa:** e2e con `setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(13 * 1024 * 1024) })`, que son tres trozos, y
   `page.route('**/storage/v1/upload/resumable/**')`:
   - Abortar una sola vez el segundo PATCH (`route.abort('connectionfailed')`) y verificar que el PATCH siguiente lleva `Upload-Offset` > 0. Eso prueba
     que retoma sin repetir.
   - Demorar un PATCH para afirmar `<progress>` con valor intermedio y «Sin conexión, reintentando…».
   - Cancelar durante la demora y verificar que no hay fila.

   En Vitest, `vi.mock('tus-js-client')` con una clase falsa que invoca `onProgress`, `onShouldRetry`, `onSuccess` y `onError`, y el filtro de
   reintento y la normalización (puntos 1 y 5) como funciones puras con su test. Los tests de página siguen mockeando `consultas` (punto 13).
   **Qué se gana:** el e2e es determinista y rápido, y prueba lo que la feature promete.

9. **`import()` dinámico innecesario (baja).** `RecursosPage` ya se carga con `lazy` (`src/app/router.tsx:33`), y `shared/lib/storage.ts` solo lo importan
   módulos del panel (`normativas/consultas.ts`, `recursos/consultas.ts` y las secuencias). El portal no pagaría la dependencia.
   **Alternativa:** importación estática en un módulo propio, `src/shared/lib/subidaReanudable.ts`, así ni siquiera la página de normativas la carga.
   **Qué se gana:** se va la espera asíncrona antes de `start()`, en la que una cancelación podría perderse si el listener del `signal` se agrega tarde,
   y los mocks quedan más simples.

10. **`onProgress` re-renderiza la pantalla entera muchas veces por segundo (baja).** tus-js-client llama a `onProgress` en cada evento `xhr.upload`, y
    `marcar` hace `setEstados` en `useAltaArchivos`, lo que vuelve a pintar `Pantalla` con toda la lista de recursos.
    **Alternativa:** guardar el porcentaje entero y no llamar a `setEstados` si no cambió (100 renders como máximo por archivo).
    **Qué se gana:** se evitan tirones con listas largas, por una línea de código.

11. **`ProgresoSubida` en `shared/ui` necesita un formateador que vive en un dominio (baja).** El texto «12,4 de 38,0 MiB» es el de `formatearTamanio`
    (`features/recursos/archivos.ts`), y `shared` no puede importar de `features` (`.claude/rules/datos.md`). Por ahora lo usa un solo dominio, porque
    normativas queda fuera de alcance.
    **Alternativa:** ponerlo en `src/features/recursos/components/`. Se mueve a `shared` (con el formateador) cuando lo use un segundo dominio.
    **Qué se gana:** no hay que mudar una utilidad del dominio para un componente con un solo uso.

12. **Criterio 8 con `getSession()`: alcanza, pero hay que cubrir la sesión nula (baja).** `getSession()` refresca si el token está por vencer, y auth-js
    serializa ese refresh con el de `autoRefreshToken` (`src/shared/lib/supabase.ts:25`). En tus-js-client v4, `onBeforeRequest` puede devolver una
    promesa, y también corre en el HEAD y en el DELETE de `abort(true)`. Si el refresh falla (sin red), `getSession()` devuelve `session: null`.
    **Alternativa:** si `session` es `null`, lanzar desde `onBeforeRequest`. La librería lo convierte en un error con status 0 y se reintenta (punto 1),
    así que vuelve a pedir el token en el próximo intento. `Authorization` va solo ahí, nunca en `headers`, para que no quede fijo el token del inicio.
    **Qué se gana:** el criterio 8 también vale con un corte que coincide con el vencimiento del token.

13. **Mantener el nombre del wrapper para no reescribir los tests de página (baja).** `RecursosPage.test.tsx` mockea `subirArchivo` de `consultas`
    (contexto §2).
    **Alternativa:** que `recursos/consultas.subirArchivo(ruta, file, mime, opciones?)` pase a llamar a `subirReanudable`, con la misma firma más un
    parámetro opcional.
    **Qué se gana:** los mocks y tests existentes siguen valiendo, y el diff de tests se concentra en lo nuevo.

14. **«El servidor los descarta solo» (Fuera de alcance) es una afirmación sin verificar (baja).** Un upload incompleto no tiene fila en
    `storage.objects`, así que `storage:limpiar` no lo ve, y eso es correcto. Pero no está comprobado que storage-api lo expire: el backend de archivos
    local podría guardarlo para siempre.
    **Alternativa:** escribir «no es un objeto: no lo ve `storage:limpiar` ni ninguna fila; ocupa espacio del backend hasta que el servidor lo expire (no
    verificado)». Con el punto 3 (sin «Reintentar» que arranque de cero), quedan menos.
    **Qué se gana:** la spec no promete algo que nadie comprobó.

Sobre la dependencia (pregunta 5): está justificada. Implementar a mano un TUS mínimo (creación, PATCH por trozos, HEAD para retomar, backoff,
abort con DELETE) son más de 150 líneas con sus tests, y supabase-js 2.117 no trae nada equivalente (contexto §3). tus-js-client es MIT, de la
organización tus, y es el cliente que recomienda Supabase. Al instalarla, verificar con `npm audit` y revisar en su `package.json` que no arrastre
dependencias solo de Node (el `FileUrlStorage` de Node) al bundle del navegador. Vite toma el campo `browser`.

## Respuesta

Acepto los 14 puntos y la dependencia; ninguno rechazado. Las severidades altas y medias entran en el corte y la spec quedó ajustada. Los cuatro que cambian lo que el usuario vio en la entrevista se le consultan antes de aprobar (marcados con *).

1. **Acepto.** `onShouldRetry` propio: reintenta status 0, 5xx, 409 (no el de la creación, ver 4) y 423, sin mirar `navigator.onLine`; los demás 4xx son definitivos. `retryDelays` de ~2 min en total y estado `'reintentando'`. (*) Ventana de ~2 min a confirmar.
2. **Acepto.** Paso 0 del plan: prueba de concepto contra el Supabase local (CORS de `Location`/`Upload-Offset`, permiso al crear, 413 y 415 reales, DELETE, HEAD de un upload completo). Se manda el header `apikey`. Si algo falla, se vuelve a la spec antes de construir.
3. **Acepto (*).** Se quita «Reintentar» por archivo. Un error deja la fila en error; para reintentar se vuelve a elegir el archivo. Reduce el alcance; el criterio 4 se reescribe.
4. **Acepto (*).** «Cancelar» se oculta cuando ya se enviaron todos los bytes («Finalizando…»); `.catch` en el `abort`; el 409 de la creación no se reintenta. El criterio 6 ya no promete «sin huérfano»: si el servidor llegó a completar, queda un objeto que limpia `storage:limpiar` (0016).
5. **Acepto.** `subirReanudable` rechaza con `{ statusCode }` (lo que ya entiende `codigosDeError`) y un `AbortError` aparte; `errores.ts` no cambia.
6. **Acepto.** Se saca `aria-live` de la lista; un único `role="status"` siempre montado que cambia en hitos (inicio, fin, error, reintentando); los errores siguen en `Alerta` sin duplicarse. Al terminar una fila el foco va al botón del dropzone o al «Reemplazar» de esa fila, con test `toHaveFocus()`.
7. **Acepto (*).** Al desmontar el hook se abortan las subidas; sin `useBlocker`. Navegar a otra pantalla cancela lo que está subiendo; `beforeunload` cubre cerrar o recargar. A confirmar con el usuario.
8. **Acepto.** E2e con un buffer de ~13 MiB (tres trozos) y `page.route` sobre el endpoint de TUS (abortar una vez un PATCH y comprobar `Upload-Offset` > 0 después; demorar un PATCH para ver el progreso y «reintentando»; cancelar durante la demora). En Vitest, `vi.mock('tus-js-client')` y el filtro de reintento y la normalización de errores como funciones puras con su test.
9. **Acepto.** Verificado: `RecursosPage` ya es `lazy` en `router.tsx:33`, así que el import estático no pesa en el resto del panel. Módulo propio `shared/lib/subidaReanudable.ts`.
10. **Acepto.** El progreso se guarda como entero y no se actualiza si no cambió.
11. **Acepto.** `ProgresoSubida` vive en `features/recursos/components/` hasta que lo use un segundo dominio.
12. **Acepto.** Sesión nula en `onBeforeRequest`: se lanza y se trata como corte (se reintenta); `Authorization` solo ahí.
13. **Acepto.** `recursos/consultas.subirArchivo` suma opciones opcionales: los mocks de `RecursosPage.test.tsx` siguen valiendo.
14. **Acepto.** Se reescribe: un upload incompleto no es un objeto ni lo ve `storage:limpiar`, pero ocupa espacio hasta que el servidor lo expire (no verificado; es parte de la prueba de concepto).

# Crítica del código

Diff sin commitear de `feat/subida-reanudable` (2026-11-10). No reabro lo que decidió la spec: TUS para todos, sin retomar tras recargar, cancelar
por archivo y sin «Reintentar». Pedían `critica-codigo.md`, pero el perfil del crítico solo deja escribir este archivo, así que la sección va acá.

Límite de la verificación: el perfil no me deja correr `npm run build`, `typecheck`, `lint` ni `vitest`. El bundle lo verifiqué sobre `dist/`, que se
generó a las 04:49, después de la última edición (`useRecursos.ts`, 04:47). La librería la verifiqué en `node_modules/tus-js-client` 4.3.1.

## Veredicto
Hay mejoras

Si solo se cambia una cosa: que `subirReanudable` sea dueña del estado de la subida (fase y porcentaje emitidos solo cuando cambian, y nada
después de resolver o rechazar). Así los dos hooks dejan de duplicar la deduplicación y las guardias contra eventos tardíos.

## Puntos

1. **El anuncio se arma por posición sobre dos fuentes, y el estado `Reemplazo` duplica lo que ya guarda la mutación (alta).**
   `anuncioDeSubida` (`RecursosPage.tsx:106-112`) toma el último terminado con `findLast` sobre `[...alta.estados, reemplazo]` (`:144-147`), y `reemplazo`
   no se limpia nunca: solo se fija en `:225` y `:228`. Después de un reemplazo terminado, en cada lote siguiente `findLast` devuelve el reemplazo
   viejo, que va al final del array. Por eso «B subido» no se anuncia nunca, ni al terminar el lote (criterio 10). La causa es de diseño: la página
   copia en `useState<Reemplazo>` (`{ recursoId, file, resultado }`) lo que la mutación ya tiene en `reemplazar.variables` (`{ recurso, file }`) y
   en `status`/`error`. El orden entre las dos fuentes depende del lugar en el array y no de cuál pasó último.
   **Alternativa:** sacar `Reemplazo` y `terminar()`. Derivar `recursoId`, `file` y el resultado de `reemplazar.variables`, `isSuccess` e
   `isError` + `esCancelacion(reemplazar.error)`, y llamar a `reemplazar.reset()` al empezar un lote en `elegirArchivos`. Con eso, en cada momento
   hay a lo sumo una fuente con hitos (el lote o el reemplazo, que nunca corren juntos por la guardia `subiendo`), y el join «último terminado +
   el que sigue» queda dentro de una sola lista, donde sí vale.
   **Qué se gana:** un estado menos en la página (con su `setReemplazo` condicional) y el criterio 10 se cumple en la secuencia reemplazo → lote.

2. **La máquina de estados de la subida está repartida entre la librería y dos hooks, con guardias contra eventos tardíos en cada uno (media).**
   - `subidaReanudable.ts:86-89` llama a `onProgress` en cada evento, aunque el porcentaje no haya cambiado.
   - `useAltaArchivos` lo filtra con un espejo `actuales` + `publicar` + una comparación campo por campo (`useRecursos.ts:152-174`).
   - `useReemplazarArchivo` lo filtra de otra forma: con updaters que devuelven el mismo objeto (`:74-87`).
   - Los dos derivan `'finalizando'` con `estadoSegunProgreso` (`:51-52`), y cada uno se protege a su manera de un evento que llega después de
     terminar: la guardia `TERMINADOS` (`:156`) en uno y `vigente()` (`:71`) en el otro.

   Esa protección no sobra. En tus-js-client, `abort(true)` llama a `BaseUpload.terminate`, que ante un DELETE fallido llama a
   `shouldRetry(err, 0, options)` → **nuestro `onShouldRetry`** (`node_modules/tus-js-client/lib.esm/upload.js:886` y `:1033`). Entonces, cancelar
   sin red, o el `descartar` tras agotar los reintentos, dispara `onReintento()` cuando la promesa ya se resolvió. El fake de `vi.mock('tus-js-client')`
   no modela `terminate`, así que ningún test lo ve.
   Además hay una inconsistencia: `onReintento` con el 100 % ya enviado pasa la fila a `'reintentando'`, y `ProgresoSubida.tsx:25` vuelve a mostrar
   «Cancelar» porque solo lo esconde en `'finalizando'`. Es justo la carrera con el último trozo que el criterio 6 quería evitar.
   **Alternativa:**
   - `subirReanudable` recibe un solo `onCambio({ progreso, fase: 'subiendo' | 'reintentando' | 'finalizando' })`, que emite solo si algo cambió.
   - Un flag local `cerrada` (se fija en `onSuccess`, `onError` y `alCancelar`) corta todo callback posterior. Esto cubre también el `onReintento`
     que llega desde `terminate`.
   - El predicado puro queda como `debeReintentar(status)`, sin efecto. El adaptador de tus es el que llama a `onCambio`.
   - En `ProgresoSubida`, «Cancelar» se muestra solo si `progreso < 100`, sea cual sea la fase.
   - Los hooks quedan en `marcar(i, cambio)` y `setSubida(cambio)`, sin espejo, sin comparación y sin `vigente()`.

   **Qué se gana:** se van unas 30 líneas de los hooks, la garantía «nada después de terminar» queda en el único módulo que conoce TUS y tiene un
   test, y «Cancelar» no reaparece durante la recuperación del último trozo.

3. **Las sobrecargas de `altaArchivo` y `reemplazarArchivo` solo sirven para tipar los mocks (media). Conviene deshacerlas.**
   `secuencias.ts:30-41` y `:63-69` declaran una firma sin opciones y otra con `Required<OpcionesSubida>`, y la implementación es idéntica en los dos
   casos. La razón real está en `useRecursos.test.ts:434-437`: `vi.mocked(...)` toma la **última** sobrecarga, y así `opciones.signal` se usa sin `?`.
   Es una característica poco común de TypeScript, que el código de producción no necesita, puesta para que compile un test.
   **Alternativa:** una sola firma, `opciones: OpcionesSubida = {}` (como en `consultas.subirArchivo`), y en el test `opciones?.signal?.addEventListener(...)`
   o un helper `pendiente(opciones)` que haga la aserción una vez. Si se toma el punto 2, el tipo de opciones cambia igual.
   **Qué se gana:** se van `OpcionesCompletas`, cuatro firmas y la sorpresa para quien lea `secuencias.ts`.

4. **Los estados «en curso» y «terminado» se definen dos veces, y la página castea (baja).** `TERMINADOS` está en `useRecursos.ts:138` y en
   `RecursosPage.tsx:80`. `EN_CURSO` está en la página (`:79`) y el tipo `EstadoEnCurso` en el hook (`:46`). Encima, `RecursosPage.tsx:271` hace
   `e.estado as EstadoEnCurso` porque el `filter` no estrecha el tipo.
   **Alternativa:** exportar desde el hook un guard `estaEnCurso(estado): estado is EstadoEnCurso` y la lista de terminados, y usarlos en los dos
   lados.
   **Qué se gana:** una lista de estados que se toca en un solo lugar, y el compilador avisa si se agrega un estado.

5. **`subidaReanudable` vuelve a leer las variables de entorno (baja).** `subidaReanudable.ts:97` y `:102` usan `import.meta.env.VITE_SUPABASE_*` con
   un `?? ''` que manda un `apikey` vacío sin avisar, mientras `supabase.ts:3-9` ya las valida con `leerVariable`.
   **Alternativa:** exportar desde `supabase.ts` la URL y la clave ya validadas, y usarlas en las dos partes.
   **Qué se gana:** un solo lugar que conoce las variables y falla con un mensaje claro.

## Lo que está bien así (preguntas 4 a 7)

- **`FileDropzone`:** el `useRef` interno solo alimentaba `ref=` (no había `click()` ni ningún otro uso), así que pasarlo a prop no cambia
  `NormativaFormPage.tsx:224`. El anillo `has-[input:focus-visible]` es una mejora también para normativas: el input `sr-only` no mostraba foco al
  tabular.
- **`esCancelacion` en `shared/lib/erroresStorage.ts`:** va junto a `codigosDeError`, y es lo que pidió el punto 5 de la crítica de la spec.
- **Acoplamiento:** `recursos/consultas.subirArchivo` envuelve `subirReanudable` con el bucket, igual que hacía con `storage.ts`. Respeta
  `rules/datos.md`: lo genérico va en `shared/lib`, y el dominio pone el bucket. Normativas sigue con `storage.subirArchivo`
  (`normativas/consultas.ts:1,10`), sin cambios.
- **Bundle:** `Tus-Resumable`, `fromUint8Array` (js-base64) y los mensajes `tus: ` aparecen solo en `dist/assets/RecursosPage-CK3mFZii.js` (77 KB
  sin comprimir). No hay `proper-lockfile`, `createReadStream` ni `node:fs`. Vite toma el campo `browser` del `package.json` de la librería, y el
  chunk principal `index-*.js` no la incluye.
- **Carreras en `subirReanudable`:** abortar durante la espera de un reintento limpia `_retryTimeout` (`upload.js:422`). Un error posterior al
  abort no se emite (`:445`). Abortar después del éxito no hace nada, porque el listener se quita en `onSuccess`. Abortar con el POST en vuelo
  (`url == null`) no manda el DELETE, y el upload queda incompleto en el servidor, que es lo que la spec aceptó (Fuera de alcance). Un
  resolve/reject doble es inocuo. La única fuga real es la del punto 2.
- **Foco:** el contador `terminados` + `foco` + el efecto sin dependencias es la pieza más frágil, pero el reintento en el render siguiente
  tiene razón de ser: `onSettled` devuelve `invalidar()` (`useRecursos.ts:92`) y la mutación sigue pendiente, con «Reemplazar» deshabilitado,
  hasta el refetch. No veo una alternativa claramente más simple.
- **Desvíos que reportó el implementador:**
  - Nombre visible en `ProgresoSubida`: aceptable, porque la lista anterior también lo mostraba.
  - Aviso extra cuando hay un reemplazo en curso: aceptable y necesario, porque el dropzone no se deshabilita y un lote en paralelo rompería
    «de a uno» y calcularía el `orden` con la caché vieja.
  - El status que junta el último terminado con el que sigue: aceptable como idea, porque «listo» y el «subiendo» siguiente caen en el mismo
    render del `for`. El problema es mezclar dos fuentes (punto 1).
  - Las sobrecargas: deshacerlas (punto 3).
- `beforeunload` y el abort al desmontar: simples y como pide el criterio 9.

## Respuesta (crítica del código, junto con `revision.md`)

Una sola ronda por fase. Las altas y medias entran en el corte; las bajas van a `notas.md`. Coinciden crítico y revisor en tres hallazgos reales (anuncio por posición, `onReintento` tras terminar, «Cancelar» que reaparece al 100 %), lo que los vuelve prioritarios.

1. **Acepto (alta).** El anuncio de fin se pierde en dos flujos (lote con un cancelado en espera; reemplazo seguido de lote). Se corrige con la alternativa más chica que cumpla el criterio 10: derivar el hito del reemplazo de la mutación (sin el estado `Reemplazo` duplicado) y resetearlo al empezar un lote, o registrar el último hito por orden de llegada. Tests nuevos para los dos flujos: «A subido» tras cancelar C en espera, y «X subido» tras un reemplazo.
2. **Acepto el arreglo mínimo, rechazo el rediseño (media).** Entra el flag `vigente`/`cerrada` en `subirReanudable` (`onSuccess`, `onError` y cancelación): después de cerrar, `onReintento` no se llama aunque `terminate()` reintente el DELETE por nuestro `onShouldRetry`. Entra también ocultar «Cancelar» cuando `progreso >= 100` sea cual sea la fase. **Rechazo** unificar todo en `onCambio({ progreso, fase })`: los tests en rojo que dejó el test-writer fijan `onProgress` y `onReintento` por separado (spec aprobada) y rehacerlos agranda el corte para ahorrar ~30 líneas. Queda anotado en `notas.md`.
3. **Acepto (media).** Una sola firma en `secuencias.ts` (`opciones: OpcionesSubida = {}`), y el test usa `opciones?.signal`. Se deshacen `OpcionesCompletas` y las sobrecargas.
4. **A `notas.md` (baja).** `TERMINADOS`/`EN_CURSO` duplicados y el cast en `RecursosPage.tsx:271`.
5. **A `notas.md` (baja).** Variables de entorno de `subidaReanudable.ts` vs `leerVariable` de `supabase.ts`: tocar `supabase.ts` no es del corte.
6. **Acepto (importante, revisor).** `onShouldRetry` decide con `Number(statusDelError(error))`, no con el HTTP: un 400 con `statusCode` `"503"` o `"423"` se reintenta; con `"403"` o sin JSON, no. Tests de los tres casos. Es lo que dice el criterio 3 de la spec.
7. **Acepto (revisor, caso borde del criterio 6).** Cubierto por «Cancelar» oculto con `progreso >= 100` (punto 2), con su test.
