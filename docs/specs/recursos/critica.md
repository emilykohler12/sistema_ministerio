# Crítica de la spec: recursos

- **Fecha:** 2026-10-10 (spec en borrador)
- **Leído:** `spec.md` y `contexto.md`; la spec, la crítica y las notas de `talleres`; ADR 0004, 0006, 0009, 0012, 0013 y 0015;
  definición §5.1–5.3, §8.3 (`recurso`) y §8.4; las migraciones `base`, `guardias` y `talleres`; las cuatro guardias globales;
  `src/features/talleres/{types,consultas,errores}.ts` y `hooks/useTalleres.ts`; `FileDropzone`; la skill `supabase-rls`.
- **Corrido / verificado:**
  - Contra la base local armé un prototipo de `recurso_completar_archivo` y lo probé en una transacción con rollback: bucket, política
    select de `storage.objects`, tabla con RLS y el trigger tal como lo describe la spec. Resultado: un insert de archivo hecho por
    `authenticated` sin la marca da **`DA003`**, y por `anon` también **`DA003`**; un enlace sin la marca da `42501`. Con el admin el
    trigger pisa el `tamanio_bytes` enviado (999 → 123).
  - El código de storage-api v1.79.36 (contenedor local, `dist/storage/uploader.js`) sube el archivo al backend y recién después crea la
    fila de `storage.objects` con `metadata`, en `completeUpload`, dentro de una transacción como superusuario que se confirma antes de
    responder. Con un multipart toma el MIME de `formData.fields.contentType` o, si no viene, del Content-Type de la parte.
  - El código de storage-js 2.117.3 (`uploadOrUpdate` y `prepareUploadFormData`): si el cuerpo es un `File` o un `Blob`, lo manda como
    `FormData` sin campo `contentType` y **no usa `options.contentType`**.

## Veredicto
Hay mejoras. El modelo de consistencia (orden de las operaciones, compensaciones, aceptar solo huérfanos en Storage), el bucket creado por
migración, la FK sin cascada, el grant de UPDATE por columna y los recursos embebidos en `['talleres']` son buenas decisiones. Hay tres
cosas para cambiar antes de aprobar. La primera rompe un criterio del pgTAP tal como está escrito y además sobra.

---

## 1. Trigger `recurso_completar_archivo`: sobra, y tal como está rompe el criterio 11 (media-alta)
**Problema.** Hay tres cosas.
- **Rompe el pgTAP.** Un trigger BEFORE corre antes que el WITH CHECK de la RLS (`ExecInsert`: triggers BEFORE, después la RLS, después
  los CHECK). Quien no es admin no ve el objeto en `storage.objects`, así que el trigger lanza `DA003` antes de que la RLS diga `42501`.
  Lo verifiqué: anon y sin marca reciben `DA003` al insertar un archivo. El criterio 11 pide "INSERT anon y sin marca → `42501`". Ese
  test falla si se escribe con un archivo, o pasa sin probar nada si se escribe con un enlace. Es la misma trampa que `taller_validar_categoria`
  esquivó con "si no ve la categoría, no decide". Este trigger no tiene cómo distinguir "no existe" de "no lo puedo ver".
- **No hay carrera que cubrir.** storage-api confirma la fila con `metadata.size` antes de responder la subida. Si el cliente espera a
  `upload()` antes de insertar, la fila ya es visible. Entonces el trigger solo detecta errores de nuestra propia secuencia, que
  `secuencias.test.ts` ya prueba.
- **La garantía es más chica de lo que dice la spec.** "La base garantiza que la fila apunta a un archivo que existe" vale solo al momento
  de escribir. Un `remove()` posterior (el admin tiene la política delete) deja la fila apuntando a la nada y la base no se entera.
  A cambio, el trigger acopla la base al contenido de `storage.objects.metadata`, que es interno de storage-api. Suma `DA003`, su rama en
  `errores.ts` y datos de prueba en `storage.objects` en el pgTAP de `recurso`.

**Por qué importa.** Es la pieza con más acoplamiento del corte. Defiende contra un caso que no ocurre y deja un test del criterio 11
que no se puede cumplir como está redactado.

**Recomendación.** Quitar el trigger. El cliente manda `tamanio_bytes = file.size`, que son exactamente los bytes que subió, y el admin
es de confianza. El CHECK queda como `tamanio_bytes > 0`. El tope de 50 MiB lo hace cumplir el bucket, que la spec ya declara "autoridad
de formato y tamaño" y que el pgTAP fija en 52 428 800. Así el límite queda en un solo lugar de SQL (hoy está en tres: bucket, CHECK y
`config.toml`). El grant de UPDATE por columna suma `tamanio_bytes` para el reemplazo. Se van `DA003`, el mensaje correspondiente y los
tres asserts del trigger.
Si igual lo quieren conservar, la primera línea tiene que ser `if not (select public.es_admin()) then return new; end if;`, para que la
RLS responda `42501`. Además el comentario debería decir "existe al escribir", no "la base garantiza".

## 2. El tipo sale del MIME del navegador, y storage-js no deja corregirlo con `contentType` (media)
**Problema.** La spec deduce el tipo con `tipoDeArchivo(file.type)` y sube el `File` tal cual. En storage-js 2.117 un `File` viaja como
multipart y `options.contentType` se ignora. Entonces el MIME que valida el bucket es el `file.type` que informa el navegador, que lo saca
del sistema operativo. En Windows, `.docx` y `.pptx` dependen del registro, y hay casos conocidos de `file.type` vacío en equipos sin
Office. Con un tipo vacío el cliente rechaza un archivo válido como "formato no admitido". Si la validación del cliente no lo frena, la
parte viaja como `application/octet-stream` y el bucket responde 415.

**Por qué importa.** Las PC de una escuela o de una oficina son justo el caso que no controlamos. Además la falla se ve como un error de
formato, no de configuración.

**Recomendación.** Una sola tabla en `archivos.ts`: extensión → `{ tipo, mime }`. `tipoDeArchivo` usa la extensión (y el `file.type`,
si viene, solo como respaldo). La subida manda `new File([file], file.name, { type: mime })`, así el bucket recibe siempre el MIME
canónico. `MIME_POR_TIPO`, que el pgTAP compara con `allowed_mime_types`, sale de esa misma tabla. Es la misma cantidad de código y no
depende del equipo de quien carga. El bucket sigue siendo la autoridad.

## 3. `secuencias.ts` con puertos inyectados: alcanza con importar `consultas` (baja)
**Problema.** La spec justifica los puertos con que "0012 prohíbe mockear supabase-js". Pero 0012 resuelve ese caso con
`vi.mock('../consultas')`, que es el molde de todos los hooks del proyecto. Los puertos agregan un tipo `{ subir, insertar, actualizar,
borrarFila, borrarArchivo }`, el armado de ese objeto en cada hook y una indirección más para quien lee.

**Por qué importa.** Es un segundo patrón de testeo para lo mismo, y los cortes copian el molde.

**Recomendación.** Dejar `secuencias.ts` como funciones async que importan sus pasos de `./consultas` (`subirArchivo`, `insertarRecurso`,
`reemplazarArchivoDeRecurso`, `eliminarRecurso`, `borrarArchivo`). `secuencias.test.ts` hace `vi.mock('./consultas')` y prueba cada
compensación y el `console.warn` igual que con fakes. Los hooks llaman a `secuencias`. Se mantiene la cobertura de la lógica más delicada
y desaparecen el tipo de los puertos y los "adaptadores".

---

## Sobre las preguntas puntuales
1. **Trigger que lee `storage.objects`.** No vale la pena. Ver el punto 1: la carrera "subida aún no visible" no existe con
   storage-api v1.79, porque confirma la fila antes de responder.
2. **Puertos en `secuencias.ts`.** Sobran frente a 0012. Ver el punto 3. El módulo aparte, en cambio, sí se justifica.
3. **Recursos embebidos en `['talleres']`.** Está bien así. Es una sola clave, la limpieza por rol ya está resuelta (0014), la columna
   "Recursos" del panel sale gratis y el peso extra para cientos de talleres es despreciable. Dos ajustes chicos:
   - Exportar la clave desde talleres (hoy `CLAVE` es privada de `useTalleres.ts`), en vez de repetir el literal en `recursos/hooks`.
   - En la subida múltiple, invalidar una vez al terminar el lote y no en cada archivo: cada `invalidateQueries` cancela el refetch
     anterior y vuelve a pedir el catálogo entero.
4. **`ordenar_recursos`.** Está bien así, y es mejor que un "intercambiar dos filas". Con el max+1 calculado en el cliente pueden quedar
   dos recursos con el mismo `orden` (por ejemplo, una subida múltiple con la caché todavía vieja). El desempate por `id` los muestra bien,
   pero un intercambio de `orden` entre dos valores iguales no movería nada. La RPC con la lista completa renumera y lo resuelve.
   Conviene calcular `max + 1 + i` una vez al empezar el lote. Ojo con el pgTAP: un `authenticated` sin marca que llama a la RPC no recibe
   un error, sino `void`, porque la RLS deja 0 filas. El test tiene que esperar "no cambió nada", no `42501`.
5. **Políticas de `storage.objects`.** Está bien así. `upload` con `upsert: false` solo necesita la política insert; `remove` y
   `createSignedUrl` necesitan select, y ya está. No hace falta una guardia global ahora: con un solo bucket, el pgTAP del corte cubre lo
   mismo. Conviene sumarla con el segundo bucket (normativas, público), que es cuando aparece la regla que se repite. Alcanza con un
   `is_empty` sobre `pg_policies` de `storage.objects`: ninguna política de escritura para `anon` ni para `public`.
6. **Dominio `recursos/` propio.** Está bien así. Storage, `archivos.ts`, YouTube y las secuencias no tienen nada que ver con
   categorías y niveles, y el corte descargas va a reusar las etiquetas y `formatearTamanio`. La dependencia con talleres es solo de
   tipos (`Taller` importa `Recurso`) más la clave de caché del punto 3. Hay que corregir `arquitectura.md`: hoy dice que los recursos
   quedan "pendientes" dentro de `talleres`.
7. **Tamaño y fases.** Está bien así: un PR con las fases A y B y una crítica de código al cerrar A, como en talleres. Con los puntos 1
   y 3, la fase A pierde el trigger y sus tests, y la fase B pierde los puertos. Es lo que más reduce el corte sin sacarle funcionalidad.

## Lo que está bien
- El invariante está escrito como una garantía concreta ("ninguna fila apunta a un archivo inexistente; el único modo de falla es un
  huérfano") y el orden de las operaciones lo sostiene en los tres flujos.
- El bucket se crea por migración y no en `config.toml`, que solo aplica en local. El pgTAP fija `public`, el límite de tamaño y los MIME.
- La FK sin cascada, con el motivo escrito.
- Rutas `<taller_id>/<uuid>.<ext>` con CHECK de prefijo y `unique`. El nombre visible queda en la fila y no hay `upsert`.
- La política select de `recurso` copia el molde de los puentes, así la baja del taller oculta sus recursos sin una regla nueva.
- `tipo_recurso` como enum (0015), con etiquetas en un `Record` con `satisfies`.
- La pregunta 2 (publicar sin recursos) tiene una buena recomendación: evita un invariante entre dos tablas que hoy no paga.

---

## Respuesta
Agente principal, 2026-10-10. Spec actualizada.

1. **Acepto.** El argumento decisivo es el orden BEFORE-trigger → RLS, que el crítico reprodujo en la base local: el trigger convierte un
   `42501` en un `DA003` y no puede distinguir "no existe" de "no lo veo". Se quita el trigger y `DA003`; el cliente manda `file.size`;
   CHECK `tamanio_bytes > 0`; el tope de 50 MiB queda solo en el bucket; `tamanio_bytes` entra al grant de UPDATE por columna. El criterio 7
   pasa a decir que el invariante lo sostiene el orden de las operaciones, no la base.
2. **Acepto.** Tabla `FORMATOS` (extensión → `{ tipo, mime }`) en `archivos.ts`, subida con `new File([file], name, { type: mime })`.
   `MIME_POR_TIPO` sale de esa tabla. Criterio 1 ajustado.
3. **Acepto.** `secuencias.ts` importa de `./consultas` y se testea con `vi.mock('./consultas')`. Sin puertos.

Preguntas puntuales:
- 3: **acepto** los dos ajustes (exportar `CLAVE_TALLERES`; invalidar una vez por lote).
- 4: **acepto** `max + 1 + i` por lote y el assert "sin marca → no cambia nada" en el criterio 11.
- 5: **acepto** diferir la guardia global de Storage al bucket de normativas; queda en Brechas.
- 6: **acepto**; `arquitectura.md` en la lista de docs.

---

# Crítica de código: fase A

- **Fecha:** 2026-10-10
- **Leído:** `spec.md` (v2), esta crítica con la Respuesta, `notas.md`, `supabase/migrations/20261010044500_recursos.sql`,
  `supabase/tests/recursos.test.sql`, el molde `*_talleres.sql`, `git diff docs/definicion-dam.md` y la parte de `recurso`,
  `ordenar_recursos` y `tipo_recurso` de `src/shared/types/database.ts`.
- **Corrido / verificado:**
  - `npm run test:db`: 12 archivos, 270 tests, verde.
  - En la base local, en transacciones con rollback:
    - Con `set local storage.allow_delete_query = 'true'`, un `delete` sobre `storage.objects` del bucket borra 0 filas sin la marca
      y 1 con la marca.
    - Si se cambia la política de delete por una sin `es_admin()`, el assert de existencia de la línea 117 del test **sigue en verde**.
    - `ordenar_recursos` con `p_ids` nulo o `{null}` en un taller con recursos da `P0001`. Con `p_ids` nulo en un taller sin recursos
      y con `p_taller_id` nulo, no hace nada.
  - storage-api v1.79.36 (contenedor local):
    - `internal/database/postgres/scope.js` fija `storage.allow_delete_query = 'true'` en cada request.
    - `ObjectStorage.deleteObjects` hace el `DELETE ... RETURNING` con el rol del usuario y la RLS activa.
    - `canUpload` con `upsert: false` hace un `createObject` de prueba con el rol del usuario.
    - `completeUpload` y `findBucketById` corren como superusuario.

## Veredicto
Hay mejoras, pero chicas. La migración copia bien el molde de talleres: grant de UPDATE por columna, RPC invoker con `search_path`
vacío y EXECUTE cerrado, políticas con `(select es_admin())` y CHECK con nombre. Además respeta todo lo aceptado en la Respuesta (sin
trigger que lea Storage, tope de tamaño solo en el bucket). Casi todos los asserts distinguen de verdad: los revisé uno por uno contra
una implementación rota. Hay una excepción, el delete de Storage, que es el punto 1.

## 1. La política de delete de `storage.objects` no se prueba: el assert pasa aunque falte `es_admin()` (media)
**Problema.** Para select e insert de `storage.objects` hay asserts funcionales por rol. Para delete hay solo un `exists` sobre
`pg_policies` con `qual like '%talleres%'`. Lo verifiqué: con `using (bucket_id = 'talleres')`, sin `es_admin()`, el test sigue en verde.
El comentario de las notas del test ("storage.objects no se borra por SQL") es cierto solo a medias. `protect_delete` es un trigger
`FOR EACH STATEMENT` que deja pasar el borrado si `storage.allow_delete_query = 'true'`, y eso es justo lo que fija storage-api en cada
request antes de borrar con el rol del usuario.

**Por qué importa.** `remove()` es la política de la que dependen el reemplazo y la eliminación de la fase B. El criterio 8 dice "solo el
admin ... borra", y esa política es la única de las tres que puede perder la condición de rol sin que nada falle.

**Recomendación.** Cambiar el `ok(exists ...)` de la línea 117 por dos asserts funcionales que reproducen lo que hace storage-api.
Después del insert del admin:
`set local storage.allow_delete_query = 'true'`; sin marca, `delete from storage.objects where bucket_id = 'talleres'` y luego, como
postgres, contar que sigue habiendo 1 objeto; con la marca, el mismo delete y contar 0. El plan sigue en 71 o sube a 72. Si prefieren no
tocar la estructura, como mínimo agregar `and qual like '%es_admin%'` al `exists`. Es más débil, pero al menos detecta que falte el rol.

## 2. `notas.md` dice "gana el último" en dos reordenamientos simultáneos, y no es exacto (baja)
**Problema.** En READ COMMITTED, si A cambia la fila X sin confirmar y B arranca su `update`, B ve en su snapshot el valor viejo de X. Si
ese valor ya coincide con la posición que pide B, el `where orden is distinct from pos` la descarta sin esperar el lock. Cuando A confirma,
X queda con el valor de A y el resto con el de B: el resultado es una mezcla que puede repetir un `orden`. Es razonamiento sobre la
semántica de Postgres, no lo reproduje con dos sesiones. Las otras carreras están bien:
- Un alta o una baja que se confirman antes de la llamada dan `P0001` (la lista no coincide). Es lo correcto, y la pantalla refresca.
- Un alta o una baja en el microsegundo entre el `select` y el `update` dejan un `orden` max+1 o un hueco. Las dos cosas son inocuas.
- El overflow de `smallint` exige más de 32 767 recursos en un taller, porque la validación iguala la lista con las filas. No es un riesgo real.

**Por qué importa.** No importa en la práctica: hay pocos administradores, los `orden` repetidos ya se toleran por diseño (desempate por
`id`, ver la pregunta 4 de arriba) y la próxima llamada renumera. Pero la nota describe una garantía que el código no da.

**Recomendación.** Corregir la nota: "dos reordenamientos simultáneos pueden mezclarse; se tolera, porque el desempate por `id` y la
próxima llamada lo corrigen". No agregar un lock. Si algún día hiciera falta, alcanza con una línea, `perform pg_advisory_xact_lock(p_taller_id)`,
que serializa sin pasar por la RLS. `FOR UPDATE` sobre `recurso` o `taller` no sirve: sin la marca filtraría las filas y rompería el
assert "sin marca → void".

## Sobre las preguntas puntuales
1. **¿Los asserts prueban cada viñeta del criterio 11?** Sí, salvo el punto 1. Los revisé contra implementaciones rotas:
   - Las visibilidades fallan con `using (true)` porque hay recursos en borrador e inactivos.
   - El UPDATE de anon con `42501` prueba el revoke de tabla, porque sin revoke la RLS daría 0 filas y no un error.
   - Los "0 filas" de UPDATE y DELETE sin marca fallarían sin `es_admin()`, porque las filas son visibles y el grant existe.
   - Cada caso de CHECK es una fila válida salvo en el punto que prueba. Por ejemplo, "archivo sin tamaño" pasa `tamanio_bytes > 0`
     con un nulo, así que solo lo frena el xor.
   - `ordenar_recursos` sin marca fallaría si la RPC fuera definer o si la política de update no tuviera el rol.
   - La lectura de Storage por anon y sin marca da 0 con un objeto ya insertado por el admin, así que distingue.

   No hay un "0 filas" que pase sin RLS.
2. **`ordenar_recursos`.** Está bien así:
   - Un `p_ids` nulo se comporta como dicen las notas. db:types lo tipa `number[]`, no nullable, y el cliente siempre manda un array.
   - Las carreras y el overflow están en el punto 2.
3. **Políticas de Storage para la fase B.** No falta nada:
   - `upload` con `upsert: false` necesita insert (la prueba de `canUpload`). El resto corre como superusuario.
   - `remove` necesita delete y select (`DELETE ... RETURNING`).
   - `createSignedUrl` necesita select.

   Una trampa para la fase B: `remove()` devuelve `{ data: [], error: null }` si no borró nada, porque la RLS lo oculta o porque no
   existe. `borrarArchivo` tiene que tratar `data.length === 0` como falla, o el `console.warn` del criterio 7 nunca se dispara.
4. **Tipos generados.** Sirven sin casts:
   - `ordenar_recursos` queda `Args: { p_ids: number[]; p_taller_id: number }` y `Returns: undefined`.
   - El `Insert` de `recurso` exige `tipo`, `nombre`, `orden` y `taller_id`, y deja opcionales los demás campos.
   - La relación `recurso_taller_id_fkey` está, así que el embed `recurso(*)` en `obtenerTalleres` va a tipar.

   El xor archivo/enlace no aparece en el tipo. Si se quiere, se modela en el dominio. Ojo: `Update` admite `taller_id` y `created_at`,
   que el grant por columna rechaza con `42501`. En `actualizarRecurso` hay que armar el objeto con las columnas editables y no pasar la
   fila entera.
5. **Diferencia de `definicion-dam.md`.** Correcta y alineada con la migración (enum, `unique`, CHECK reales, tope en el bucket, FK sin cascada).

---

# Crítica de código: fase B

- **Fecha:** 2026-10-10
- **Leído:** `spec.md`, esta crítica con la Respuesta, `notas.md` (fases A y B), `src/features/recursos/` completo (types, archivos,
  consultas, secuencias, errores, `hooks/useRecursos.ts`, `ListaRecursos`, `DialogoRecurso`), `RecursosPage.tsx` y el `git diff` de
  `talleres/{types,consultas}.ts`, `useTalleres.ts`, `TalleresListPage`, `TallerFormPage`, `TallerDetallePage`, `FileDropzone` y `router.tsx`.
  También `useCategoriaDeRuta.ts` y `.claude/rules/react.md`.
- **Corrido / verificado:**
  - `npx vitest run src/features/recursos src/features/talleres src/pages/admin/talleres src/pages/public`: 269 tests en verde. `npm run typecheck`
    sin errores.
  - postgrest-js 2.117.3 (`node_modules/@supabase/postgrest-js/dist/index.mjs`, l. 197-220 y 418-460): un POST o un PATCH no se reintentan, y
    una falla de transporte (el fetch se corta) vuelve como `{ error: { message: 'TypeError: …', code: '' }, status: 0 }`. Un rechazo del
    servidor siempre trae `code` (SQLSTATE o `PGRST…`).

## Veredicto
Hay mejoras, pero chicas. El dominio quedó como se acordó: `consultas.ts` solo con supabase, lo puro aparte, secuencias sin puertos,
`FORMATOS` como única tabla, la clave exportada y una sola invalidación por lote. Revisé lo que pediste:
- **Éxito con una fila colgada:** no hay ningún camino donde la UI muestre éxito con una fila que apunte a un archivo inexistente. En los
  tres flujos el éxito llega solo después de que el objeto se confirmó (storage-api confirma antes de responder) o después de borrar la fila.
- **El invariante del criterio 7** se rompe en un solo caso: una falla ambigua, donde la escritura se confirmó pero la respuesta no llegó.
  Es el punto 1.
- **Desmontar a mitad de lote no rompe el invariante.** `subir` es un `async` suelto y sigue corriendo: cada `altaArchivo` completa su
  secuencia y el `invalidar` final usa el `QueryClient` global. Los `setEstados` posteriores son no-ops en React 19. Lo único que se pierde
  es el estado (`enCurso`, errores), y eso entra en el punto 2.
- **El iframe y el enlace son seguros.** `idDeYoutube` compara el host exacto y exige `^[A-Za-z0-9_-]{11}$`, así que en el `src` solo
  puede terminar un id de 11 caracteres de ese alfabeto: no hay forma de inyectar `/`, `?`, `#` ni otro host. El `href` externo ya pasó por
  el CHECK `^https://` de la base (además del zod), así que no puede llegar un `javascript:`. Tiene `rel="noopener noreferrer"`.
- **`window.open` tras `await`:** se puede aceptar como está. Chrome y Edge conservan la activación del usuario unos 5 s y la firma tarda
  mucho menos. Las notas ya documentan el plan B (abrir la pestaña antes y asignarle la URL). Ver el punto 3 para dónde ubicarlo.

## 1. La compensación borra el archivo también cuando la escritura pudo haberse confirmado (media-baja)
**Problema.** `altaArchivo` y `reemplazarArchivo` borran el archivo nuevo ante cualquier error del insert o del update. Si la conexión se
corta después de que Postgres confirmó y antes de que llegue la respuesta, postgrest-js devuelve un error de transporte (`code: ''`,
`status: 0`; no reintenta POST ni PATCH). Entonces la secuencia borra un archivo al que la fila ya apunta:
- en el alta, queda una fila colgada;
- en el reemplazo, queda la fila apuntando al archivo nuevo ya borrado, y el anterior queda además huérfano.

La UI muestra error, no éxito. Pero eso es justo lo que el criterio 7 dice que no pasa ("ninguna operación deja una fila apuntando a un
archivo que no existe"), y la consecuencia aparece recién en el corte descargas, como un 404 en la descarga de ese recurso.

**Por qué importa.** Es el único camino que viola el invariante, y lo viola con el modo de falla que la spec rechazó (fila colgada) en
lugar del que aceptó (huérfano). La ventana es chica, pero las redes de oficina y de escuela son justo las que cortan.

**Recomendación.** Ante la duda, no compensar. Agregar un predicado puro en `errores.ts`, por ejemplo
`esRechazoDelServidor(error)` (true si `code` es un string no vacío). Usarlo en el `catch` de las dos secuencias: si es un rechazo, borrar
como hoy; si no, `console.warn` del posible huérfano, sin borrar, y propagar el error. Son unas 5 líneas y dos tests en `secuencias.test.ts`
(error `{ code: '' }` → no llama a `borrarArchivo`). El peor caso pasa a ser un huérfano, que es el modo aceptado.
Hay un ajuste menor en la misma línea, opcional: `eliminarFilaRecurso` puede devolver la `ruta_archivo` de la fila borrada
(`.select('ruta_archivo')` en lugar de `'id'`) para borrar esa ruta y no la de la caché. Con la caché vieja de otra pestaña hoy queda un
huérfano de más. No rompe el invariante, porque las rutas son uuid y nunca se reusan.

## 2. Reordenar durante un lote falla siempre, con un mensaje genérico (baja)
**Problema.** `ocupado` incluye `ordenar`, `eliminar` y `reemplazar`, pero no `alta.enCurso`. La caché se invalida una vez al terminar el
lote (lo acordado). Entonces, en cuanto termina el primer archivo, la lista de ids que manda "Subir"/"Bajar" ya no coincide con los
recursos del taller, y `ordenar_recursos` responde `P0001`. La pantalla muestra "No pudimos completar la operación". "Agregar enlace"
durante el lote calcula `max + 1` con la caché vieja y repite un `orden`. Eso es tolerado por diseño, pero es el mismo origen. Si el
componente se desmonta y se vuelve a montar a mitad del lote, `enCurso` arranca en `false` y la guarda de `elegirArchivos` deja empezar un
segundo lote en paralelo. Tampoco rompe el invariante, solo repite valores de `orden`.

**Por qué importa.** Es una consecuencia directa de invalidar una vez por lote, que fue una recomendación mía. El usuario ve un error que
no causó y que no tiene arreglo hasta que termine la subida.

**Recomendación.** Sumar `alta.enCurso` a `ocupado` y deshabilitar "Agregar enlace" mientras haya un lote. Es una línea y un test
("durante la subida, Subir/Bajar están deshabilitados"). El caso del remontaje no vale más código: no mover el estado del lote a la caché
de mutaciones ni a un contexto.

## 3. `RecursosPage`: el tamaño se puede aceptar; sobran la escalera del taller copiada y la consulta directa (baja)
**Problema.** Son 333 líneas, pero es cohesivo: una resolución de ruta, una `Pantalla` con la lista y sus acciones, y dos subcomponentes
locales (`Alerta` y `BotonReemplazar`). Partirlo por tamaño no ganaría nada. Lo que sí sobra:
- Las líneas 48-53 (id del taller inválido, error, cargando, inexistente o de otra categoría) son copia exacta de `TallerFormPage` (l. 75-80).
  La regla "el taller pertenece a la categoría de la URL" ya vive en dos lugares.
- `ver` importa `urlFirmada` de `consultas` directamente en la página, contra `.claude/rules/react.md` ("nada de fetch en componentes").
  Es la única página del proyecto que lo hace.

**Por qué importa.** El corte descargas y las pantallas futuras del taller van a necesitar la misma resolución de ruta, y es la tercera
copia lo que hace divergir las reglas (ya pasó en niveles-categorias).

**Recomendación.**
- Agregar `useTallerDeRuta(nivelId, categoriaId, tallerId)` junto a `useCategoriaDeRuta`, con la misma unión discriminada
  (`cargando | error | no-encontrado | ok`), y usarlo en las dos páginas. Cada una pierde unas 8 líneas y la regla queda en un solo lugar.
- Mover "ver" a `useRecursos.ts` como `abrirArchivo(ruta)` (o `useVerArchivo`). Ahí se implementa el plan B de `window.open` si algún día
  hace falta, sin tocar la página.

Son opcionales. Si prefieren no tocar `TallerFormPage` en este PR, que quede en Brechas.

## Lo que está bien
- `secuencias.ts` es corto, se lee de arriba abajo y `borrarOAvisar` concentra el único modo de falla aceptado. Los tests cubren cada
  compensación, la compensación que falla y el orden de las llamadas.
- `borrarArchivo` trata `data.length === 0` como falla, y `mensajeDeErrorRecurso` se corrigió contra la forma real del error
  (`statusCode`), verificada contra la base local y no supuesta.
- `actualizarRecurso` recibe `CambiosRecurso` (las columnas del grant), así que no se puede mandar `taller_id`.
- La lectura no suma hook ni clave: `recurso(*)` embebido y ordenado por `orden, id` en el servidor, y `t.recurso.length` sale gratis en la lista.
- `FileDropzone` crece con una prop opcional sin tocar normativas. `DialogoRecurso` monta el formulario al abrir, así arranca limpio sin `reset`.
- `ListaRecursos` resuelve el portal sin estado y vuelve `null` si no hay recursos.
