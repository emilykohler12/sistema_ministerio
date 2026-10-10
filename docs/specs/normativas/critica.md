# Crítica de la spec: corte normativas

Crítico de diseño, 2026-10-10, sobre `spec.md` (borrador) y `contexto.md`. Lo marcado como **verificado** lo probé en la base local
(`docker exec supabase_db_sistema_ministerio psql`, dentro de `begin ... rollback`) o en el código de storage-api del contenedor.

## Veredicto
Hay mejoras. Las decisiones de la entrevista se sostienen, pero dos de ellas no funcionan tal como están escritas (puntos 1 y 2).

## Puntos

### 1. `resolver_etiquetas` "sin grant a la API" rompe `guardar_taller` y `guardar_normativa` (severidad: alta)
- **Problema:** Postgres chequea EXECUTE también en las llamadas anidadas, con el rol actual. Las dos RPC son invoker y las ejecuta
  `authenticated`. Si `resolver_etiquetas` se revoca a `public, anon, authenticated`, cualquier guardado con etiquetas falla con
  `permission denied for function resolver_etiquetas`. **Verificado:** una función invoker sin EXECUTE, llamada desde otra invoker con grant
  a `authenticated`, da ese error.
- **Evidencia:** `spec.md:41` ("invoker, sin grant a la API") y el molde de grants de `20261010034807_talleres.sql:363-367`.
- **Propuesta:** el mismo molde que `guardar_taller`: `revoke ... from public, anon` y `grant execute ... to authenticated`. Exponerla en
  `/rpc` no abre nada: es invoker, así que no hace más que un insert directo en `etiqueta`, que la RLS ya limita al admin. Un esquema no
  expuesto también funcionaría, pero suma una pieza nueva sin ganar nada. Hay que agregar a `normativas.test.sql` (o a `talleres.test.sql`)
  `has_function_privilege('authenticated', ...)` y `not has_function_privilege('anon', ...)`.

### 2. El `WHEN` con `OLD` no se puede poner en el trigger de auditoría tal como es hoy, y hay una condición más simple (severidad: alta)
- **Problema:** `auditar()` se engancha con un solo trigger `after insert or update or delete`. Postgres rechaza ahí cualquier `WHEN` que
  mencione `OLD`: **verificado**, da `INSERT trigger's WHEN condition cannot reference OLD values`. Hay que separarlo en dos triggers:
  `after insert or delete` sin `WHEN` y `after update ... when (...)`.
  Separado, el `WHEN` con `to_jsonb(old) - 'descargas' - 'updated_at'` funciona en AFTER y en BEFORE. **Verificado:** el contador no audita
  ni toca `updated_at`, y una edición real hace las dos cosas. Pero tiene dos efectos que la spec no dice:
  - un guardado sin cambios (por ejemplo, editar solo etiquetas) no se audita ni mueve `updated_at` en `normativa`, mientras que en
    `taller` sí. Así, el criterio 7 ("cualquier otro UPDATE sí se audita") es falso;
  - el admin puede hacer `update normativa set descargas = ...` directo, sin auditoría, porque la condición excluye esa columna.
- **Evidencia:** `spec.md:26,40`; `20261010034807_talleres.sql:239-241` (trigger combinado); `20261010024653_niveles_categorias.sql` /
  `talleres.sql:235-236` y `20261010044500_recursos.sql:78-79` (grant de UPDATE por columna).
- **Propuesta:**
  - Condición más simple y explícita, en los dos triggers: `when (old.descargas = new.descargas)`.
  - Sumar `revoke update on normativa from anon, authenticated` y `grant update (titulo, descripcion, numero, anio, ruta_archivo) to
    authenticated`, igual que en `categoria` y `recurso`. Con ese grant, la única forma de cambiar `descargas` es la RPC (definer). La
    condición separa exactamente "contador" de "edición", los guardados sin cambios se auditan como en `taller` y el criterio 7 queda
    literal. Sigue siendo un `WHEN` (lo decidido), solo que más corto.
- **Guardias globales:** siguen pasando. `auditoria_global.test.sql:13-16` solo pide que exista algún trigger con `auditar()`, y
  `updated_at_global.test.sql:46-50`, uno BEFORE UPDATE con `tocar_updated_at()`. Ninguna mira el `WHEN`. Por eso mismo no detectarían
  que falte el trigger de insert/delete ni un `WHEN` que nunca dispare. `normativas.test.sql` tiene que probarlo por comportamiento:
  insert, edición (también sin cambios) y delete suman una fila en `registro_operacion`; el contador, ninguna; y un `update ... set
  descargas` del admin da `42501`.

### 3. El criterio 6 ("se abre en otra pestaña") contradice `getPublicUrl(..., { download })` (severidad: media)
- **Problema:** con `download`, storage-api responde `Content-Disposition: attachment` y el PDF se descarga, no se abre. **Verificado** en
  el contenedor: `/app/dist/storage/renderer/renderer.js:113-121`. Además, un `numero` como `1234/20` da un nombre de archivo con `/`.
- **Evidencia:** `spec.md:23` frente a `spec.md:61`.
- **Propuesta:** elegir una opción y que el criterio la diga.
  - Lo más simple es abrir: `getPublicUrl(ruta)` sin `download`, en un `<a href target="_blank" rel="noopener">` cuyo `onClick` dispara la
    RPC sin `await`. No hay riesgo de bloqueo de popups porque no se espera nada antes de navegar, y "si el contador falla, la descarga
    sigue" sale solo.
  - Si se quiere forzar la descarga, el nombre se sanea (`[^\w.-]` → `-`).
  - En los dos casos, la URL se arma en `consultas.ts` y se expone desde un hook. En recursos una página llamó a `consultas` directo.

### 4. La guardia global de Storage no detecta la escritura de un `authenticated` sin la marca de admin (severidad: media)
- **Problema:** el criterio 8 solo busca políticas `to anon` o `to public`. Una política `to authenticated` sin `es_admin()` (el caso
  "sin marca" que ya prueban todos los cortes), o una `for all`, pasaría la guardia.
- **Evidencia:** `spec.md:30`; el chequeo actual por bucket en `supabase/tests/recursos.test.sql:118-123`.
- **Propuesta:** que la guardia pida que **toda** política de `storage.objects` con `cmd in ('INSERT','UPDATE','DELETE','ALL')` tenga
  `roles = '{authenticated}'` y `es_admin` en `qual` o en `with_check`. Con autoverificación, como las demás guardias globales. Así el chequeo
  de `recursos.test.sql` queda cubierto por la guardia.
- Lo demás del bucket está bien: `getPublicUrl` arma la URL en el cliente y no necesita ninguna política, la lectura pública del bucket no
  pasa por la RLS, y `remove()` necesita select y delete del admin, que la spec ya tiene (`spec.md:46`).

### 5. Una edición con caché vieja puede dejar la fila apuntando a un archivo borrado (severidad: media)
- **Problema:** `guardar_normativa` escribe la fila completa. Si recibe `ruta_archivo` siempre, aun cuando "no se elige archivo" (criterio 3),
  puede pasar esto:
  1. el admin A abre el form con la ruta X;
  2. el admin B reemplaza X por Z y borra X;
  3. A guarda sin elegir archivo y la fila vuelve a X, que ya no existe.

  Eso rompe el invariante de 0016. En recursos no pasa porque el reemplazo hace un update solo de la ruta
  (`src/features/recursos/secuencias.ts:63-82`).
- **Evidencia:** `spec.md:17-18,44`.
- **Propuesta:** `p_ruta_archivo text default null` = conservar (`coalesce`). En el reemplazo, que la RPC devuelva la ruta anterior leída
  dentro de la transacción (`select ... for update` antes del update), y el cliente borra esa y no la de la caché. Son dos líneas de SQL y
  la secuencia queda igual.

### 6. Pasar a `shared` también `compensar` y `borrarOAvisar`, no solo subir y borrar (severidad: baja)
- **Problema:** la spec mueve `subirArchivo`, `borrarArchivo` y `esRechazoDelServidor`. El molde de 0016 (`compensar` y `borrarOAvisar`,
  unas 25 líneas, `secuencias.ts:19-39`) quedaría copiado en `normativas/secuencias.ts`, y el logo lo copiaría una tercera vez.
- **Propuesta:** que `src/shared/lib/storage.ts` exporte también `compensar(bucket, ruta, error, contexto)` y `borrarOAvisar(bucket, ruta,
  contexto)`. `esRechazoDelServidor` queda privado ahí. Cada `secuencias.ts` queda solo con el orden de su dominio, que es lo que 0016 dice
  que se reutiliza.

### 7. Huecos menores de criterios y de base (severidad: baja)
- Límites del zod contra la base: `titulo` max 200 y `numero` max 50 (sin eso, un `22001` sin mensaje), y `anio` entre 1900 y 2100. Sumar
  `check (btrim(numero) <> '')` y `check (btrim(titulo) <> '')`, como en `etiqueta` y `recurso`, y guardar `numero` recortado en la RPC
  (el índice ya compara con `btrim`).
- Decir explícitamente que al reemplazar el archivo `descargas` se conserva, porque cuenta la normativa y no el archivo. Con el punto 2 ya
  es así.
- `ruta_archivo`: un `check (ruta_archivo ~ '^[0-9a-f-]{36}\.pdf$')` cuesta una línea y fija el formato de `rutaNueva()`. Es opcional.
- Criterio 8 ("anon **solo** puede..."): conviene escribirlo como pruebas concretas. Para anon: insert, update y delete en las dos tablas
  dan `42501` o 0 filas, `guardar_normativa` sin EXECUTE y la RPC del contador con EXECUTE. Así, cómo se testea no queda a interpretación.
- RPC del contador: **verificada**, está bien. `postgres` tiene `bypassrls`, así que el UPDATE dentro del definer funciona llamado como anon,
  y un id inexistente no hace nada. Basta `revoke ... from public` y `grant ... to anon, authenticated` explicitados, nombres calificados
  (`search_path = ''`) y `returns void`. Si el `WHEN` fallara, cada descarga dejaría una fila con `usuario_id` nulo ("sistema"), y eso lo
  detecta el test del punto 2.

### 8. Tamaño del corte (severidad: baja)
Es comparable a recursos, y las fases A y B alcanzan. No conviene dividirlo en más PR. Lo que sí: hacer primero los dos refactors como
commits propios (`resolver_etiquetas` con la regresión de `talleres.test.sql`, y `shared/lib/storage.ts` con los tests de recursos en verde)
y después el dominio nuevo. Así, si algo se rompe, se ve en qué commit fue.

## Respuesta

1. **Acepto.** `resolver_etiquetas` sigue el molde de grants de `guardar_taller`: se revoca a `public` y `anon` y se da a `authenticated`.
   Se prueba con `has_function_privilege`.
2. **Acepto.** Se usan dos triggers de auditoría: `insert or delete` y `update when (old.descargas = new.descargas)`. El de
   `tocar_updated_at` lleva el mismo `WHEN`. Hay grant de UPDATE por columna sin `descargas`. Sigue siendo la decisión de la entrevista
   (un `WHEN`), con una condición más simple, y el criterio 7 queda literal. Se prueba por comportamiento.
3. **Acepto abrir.** Respeta el criterio 6 y evita sanear nombres:
   - `getPublicUrl(ruta)` sin `download`;
   - un `<a target="_blank">` cuyo `onClick` dispara la RPC sin `await`;
   - la URL la arma `consultas.ts` y se expone desde un hook.
4. **Acepto.** La guardia exige `{authenticated}` y `es_admin` en toda política de escritura de `storage.objects` (también `ALL`), y
   tiene autoverificación.
5. **Acepto.** `p_ruta_archivo` nulo significa conservar. La RPC devuelve la ruta anterior, leída con `for update`, y el cliente borra esa.
6. **Acepto.** `compensar` y `borrarOAvisar` pasan a `src/shared/lib/storage.ts`.
7. **Acepto.** Sumo:
   - los límites del zod;
   - los CHECK de texto no vacío;
   - `numero` recortado;
   - el CHECK de formato de `ruta_archivo`;
   - el contador que se conserva al reemplazar;
   - el criterio 8 escrito como pruebas concretas.
8. **Acepto.** Orden de commits: primero el refactor de `resolver_etiquetas`, después el de `shared/lib/storage.ts` y al final el dominio.

# Crítica de código (fase A)

Crítico de diseño, 2026-10-10, sobre las dos migraciones (`20261010155216_resolver_etiquetas.sql`, `20261010155300_normativas.sql`) y los
tres pgTAP nuevos, sin commitear. `npm run test:db` en verde (15 archivos, 394 asserts). Lo marcado como **verificado** lo consulté en la
base local.

## Veredicto
Hay mejoras, chicas. El diseño se sostiene y sigue lo aceptado en la crítica de la spec. Revisé y está bien:
- **`guardar_taller` reescrito:** es equivalente al original (`talleres.sql:269-361`). El bloque de etiquetas se movió sin cambios y solo
  cambia el texto del `raise` interno, que sigue siendo `P0001`. Con `p_etiquetas` nulo devuelve `'{}'` igual que antes. Los grants se
  conservan.
- **`contar_descarga_normativa`:** es segura. Es `language sql`, tiene `search_path = ''` y usa nombres calificados. El dueño es `postgres`,
  que además es dueño de la tabla sin `force row level security` (**verificado**), así que la RLS no la frena ni en local ni en la nube.
  Solo puede sumar 1 a una fila por id, y los ids son públicos.
- **Los `WHEN` y el grant por columna:** separan exactamente el contador de la edición.
- **`for update`:** hace falta. Sin él, dos reemplazos simultáneos devolverían la misma ruta anterior: se borraría dos veces X1 y quedaría
  huérfana X2. Ningún test lo cubre, y es razonable, porque la concurrencia no se prueba en pgTAP.
- **Detección de mutaciones:** los tests detectan las que importan:
  - quitar `es_admin` de cualquier política (tabla, puente o Storage);
  - quitar el `WHEN` de cualquiera de los dos triggers (las asserts del contador miran `registro_operacion` sin filtrar por usuario, y
    `updated_at`);
  - dar UPDATE de `descargas` (`42501`, línea 368);
  - borrar el trigger de alta/baja;
  - pasar el contador a invoker;
  - quitar el `btrim` o el `coalesce` de la ruta.

  A diferencia de talleres, la rama de borrado del puente sí se ejercita (`Etiq Base` → `Edit Tag`).
- **Desvíos de `notas.md`:** todos razonables, incluido no poner política de UPDATE en `normativa_etiqueta`, que sigue el molde.

## Puntos

### 1. `ruta_anterior` también vuelve cuando se conserva el archivo, y el tipo generado la da como no nula (severidad: media)
- **Problema:** en una edición sin archivo (`p_ruta_archivo` nulo), la RPC devuelve la ruta **vigente** con el nombre de "la que hay que
  borrar". El contrato le deja al cliente comparar con "la ruta nueva", pero en ese caso la nueva no existe (es `undefined`/`null`).
  Una secuencia de la fase B que haga `if (ruta_anterior !== rutaNueva) borrar(ruta_anterior)` borra el PDF que la fila sigue apuntando.
  Es el modo de falla que 0016 prohíbe, y además en el camino más común (editar solo el título). Para empeorarlo, `db:types` tipa las
  columnas de `RETURNS TABLE` como no nulas: `ruta_anterior: string` (`src/shared/types/database.ts:262`), aunque en el alta es `null`.
- **Evidencia:** `20261010155300_normativas.sql:126-127,155-159,189`; contrato en `normativas.test.sql:18-20`; test `e1_ant` (líneas
  460-461), que hoy exige devolver la ruta vigente.
- **Propuesta:** que la RPC devuelva la ruta **solo si fue reemplazada**, y renombrarla `ruta_reemplazada`:
  `ruta_reemplazada := nullif(v_ruta_anterior, coalesce(p_ruta_archivo, v_ruta_anterior));`
  - La regla del cliente pasa a ser "si viene, se borra", sin comparar nada.
  - Ajustar el test `e1_ant` para que espere `null` y sumar un caso con la misma ruta, que también devuelve `null`.
  - En la fase B, tipar el resultado como `string | null` en `consultas.ts` (no confiar en el generado).

  **Qué se gana:** una línea de SQL elimina la comparación del cliente y la posibilidad de borrar el archivo vivo. No reabre el criterio 3
  ("borra la ruta anterior que devuelve la RPC"), solo lo hace inequívoco.

### 2. Asserts duplicados entre archivos, y uno que no distingue (severidad: baja)
- **Problema:**
  - `normativas.test.sql` repite lo que ya prueban los archivos dedicados:
    - los privilegios de `resolver_etiquetas` (líneas 236-242) y su `42501` para anon (277-279) están en `resolver_etiquetas.test.sql`;
    - el `is_empty` de políticas de Storage (220-225) es un subconjunto de la guardia de `storage_global.test.sql`.
  - En `resolver_etiquetas.test.sql:20-24`, el chequeo `aclexplode` de PUBLIC sobra: `not has_function_privilege('anon', ...)` ya da
    falso si PUBLIC lo tiene. En `contar_descarga_normativa` sí hace falta, porque anon tiene un grant explícito.
  - "Es atómico: un alta rechazada no deja etiquetas" (443-445) no distingue nada. El insert de la normativa falla antes de llegar a
    `resolver_etiquetas`, así que pasaría con cualquier implementación.
- **Propuesta:**
  - Borrar esos asserts duplicados y bajar el `plan`.
  - Sacar el test de atomicidad, o renombrarlo a lo que de verdad prueba. Después de `resolver_etiquetas` no queda ningún paso que pueda
    fallar (el puente usa `on conflict do nothing`), y la atomicidad ya viene de que todo es una sola llamada a una función.

  **Qué se gana:** unas 20 líneas menos y una sola fuente por regla. Cuando cambie un grant, se toca un solo archivo.

### 3. El comentario "única forma de cambiar `descargas`" no vale para `service_role` (severidad: baja)
- **Problema:** `service_role` conserva el UPDATE de toda la tabla. **Verificado:** `has_column_privilege('service_role', 'public.normativa',
  'descargas', 'UPDATE') = t`. Un update de una Edge Function futura que cambie `descargas` junto con otra columna se saltearía la
  auditoría por el `WHEN`. `service_role` es de confianza total, así que no es una brecha, pero el comentario promete algo más fuerte.
- **Evidencia:** `20261010155300_normativas.sql:8,54-58,202`.
- **Propuesta:** no tocar los grants. Corregir el comentario: "para anon y authenticated, la única forma es la RPC; `service_role` no
  debe tocar `descargas`". Es una línea.

## Respuesta

1. **Acepto.** `ruta_anterior` vuelve solo si se reemplazó el archivo; si no, es null. El test `e1_ant` se ajusta, y la fase B la tipa como
   `string | null`. Es un riesgo real de borrar el PDF vigente (0016).
2. **Rechazo los duplicados** porque no afectan la corrección. **Acepto quitar el `aclexplode` de PUBLIC** si sobra. El test de atomicidad
   se fortalece solo si cuesta poco; si no, se deja.
3. **Acepto, pero con un arreglo mejor que el del comentario.** Lo mismo señaló el revisor (hallazgo 1): un UPDATE de `service_role` que
   cambie `descargas` y además otra columna queda sin auditar. Se amplía el `WHEN` de los dos triggers para que solo se omita cuando lo
   único que cambia es el contador:
   `old.descargas = new.descargas or (to_jsonb(old) - 'descargas' - 'updated_at') is distinct from (to_jsonb(new) - 'descargas' - 'updated_at')`.
   Como la migración no está en `main`, se corrige en el lugar.

# Crítica de código (fase B)

Crítico de diseño, 2026-10-10, sobre el frontend sin commitear: `shared/lib/storage.ts`, `botonClases`, `features/etiquetas/`,
`features/normativas/`, el refactor de `recursos` y `talleres`, y las cuatro pantallas con sus tests.

## Veredicto
Hay mejoras, chicas. El corte sigue lo aceptado en la crítica de la spec y en la de la fase A. Revisé lo que se pidió mirar:
- **Invariante de 0016:** se cumple. El alta sube y después guarda, y compensa solo ante un rechazo del servidor. La edición no recibe la
  normativa de la caché, sino solo el `id` (`secuencias.ts:42`). Por eso no puede borrar una ruta vieja aunque alguien la cambie después:
  solo borra la `ruta_anterior` que devuelve la RPC, y si viene `null` no borra nada. La baja borra la fila antes que el archivo. Los tests
  de `secuencias.test.ts` fijan el orden con `llamadas` y cubren el corte de red (no borra nada) y el borrado fallido (avisa).
- **El cast de `guardarNormativa`** (`consultas.ts:37,40`) está bien. Está en un solo lugar, con el porqué escrito, y lo que corrige
  (`p_descripcion` y `p_ruta_archivo` nulos, `ruta_anterior: string | null`) es exactamente lo que typegen tipa mal.
- **Ninguna página importa `consultas`.** `EnlaceDescarga` pasa por el hook.
- **El refactor de `recursos` no cambia el comportamiento.** El texto de `compensar` y `borrarOAvisar` es idéntico, y los seis casos de
  `esRechazoDelServidor` (incluido `{ code: 42501 }` numérico) pasaron a `storage.test.ts` a través de `compensar`. La inyección de
  `borrar` en vez del bucket está justificada: así los tests de cada dominio siguen mockeando solo `./consultas`.
- **Los tests detectan las regresiones que importan:** el orden de las operaciones, que la compensación no se dispare ante un corte de
  red, el `p_ruta_archivo: null` al editar sin archivo, que el contador cuente una sola vez y que no haga `preventDefault`, y que el
  guardado de un taller invalide `['etiquetas']`.

## Puntos

### 1. Normativas depende de talleres para cuatro piezas genéricas, y `codigos()` quedó copiado (severidad: media)
- **Problema:** el dominio nuevo importa de otro dominio cosas que no son de talleres:
  - `normalizar` (`normativas/filtrar.ts:1`);
  - `idDeRuta` (`NormativaFormPage.tsx:11`);
  - `NoEncontrado` desde `pages/admin/talleres` (`NormativaFormPage.tsx:22`), con `volverA = '/admin/talleres'` por defecto;
  - `TallerBuscador` (`NormativasAdminPage.tsx:6`, `NormativasPublicPage.tsx:4`). Su `id="taller-buscador"` y su etiqueta para lectores
    de pantalla, "Buscar por nombre o etiqueta", no describen la búsqueda de normativas, que también mira el número y la descripción.

  Además, `codigos()` es idéntico en `recursos/errores.ts:9-13` y `normativas/errores.ts:10-14`. Lo mismo pasa con el mapeo 413 → tamaño
  y 415 → formato. El logo lo copiaría una tercera vez, que es el mismo argumento por el que aceptaron el punto 6 de la spec.
- **Propuesta:** un commit mecánico, sin lógica nueva:
  - `NoEncontrado` → `src/shared/components/ui/NoEncontrado.tsx`, con `volverA` obligatorio;
  - `TallerBuscador` → `src/shared/components/ui/Buscador.tsx`, con `etiqueta` y `placeholder` como props;
  - `normalizar` e `idDeRuta` → `src/shared/lib/utils.ts`, o `texto.ts` si prefieren separarlos;
  - `codigos()` → un módulo puro, `src/shared/lib/erroresStorage.ts` (sin importar supabase, para que `errores.ts` siga siendo puro).
    Cada `errores.ts` conserva sus mensajes.
- **Qué se gana:** `normativas` deja de depender de `talleres`. Padrón y logo, los próximos cortes, importan desde `shared`, como pide
  `.claude/rules/react.md` ("si creás uno genérico, va ahí"). Y la etiqueta accesible del buscador deja de describir otra pantalla.

### 2. La baja borra la ruta de la caché y no la de la base (severidad: baja)
- **Problema:** `eliminarNormativa(normativa)` borra `normativa.ruta_archivo`, que sale de la caché (`secuencias.ts:57-59`,
  `useNormativas.ts:51`). Si la caché está vieja, intenta borrar un archivo que ya no existe, lo que da un `warn`, y deja huérfano el
  archivo que la fila sí apuntaba. Por ejemplo, otro admin reemplazó el PDF, o falló el refetch después de un reemplazo. No rompe 0016,
  porque la fila se borra primero, pero es justo la regla que el criterio 3 fijó para la edición ("la de la base, no la de la caché"), y
  la edición ya la cumple por firma.
- **Propuesta:** que la fila borrada devuelva su ruta:
  ```ts
  eliminarFilaNormativa(id): Promise<string> // .delete().eq('id', id).select('ruta_archivo').single()
  ```
  Así `eliminarNormativa(id)` borra esa ruta, y `useEliminarNormativa` recibe solo el id. En `secuencias.test.ts`, el mock de
  `eliminarFilaNormativa` devuelve `RUTA_VIEJA`.
- **Qué se gana:** la misma regla para el reemplazo y para la baja, sin una línea más, y una firma que no deja usar la caché por error.
  `recursos` tiene el mismo patrón (`recursos/secuencias.ts:45,66-68`). Queda fuera de este corte, pero conviene anotarlo.

### 3. `useContarDescarga` no es un hook y se defiende de casos que no pueden pasar (severidad: baja)
- **Problema:** `useContarDescarga` no llama a ningún hook: devuelve una clausura nueva en cada render (`useNormativas.ts:62-75`). El
  segundo `try` y el `?.` de `contarDescargaNormativa(id)?.catch(...)` existen solo porque un mock puede devolver `undefined` o lanzar de
  forma síncrona. Una función `async` no hace ninguna de las dos cosas, y el test "lanza de forma síncrona"
  (`useNormativas.test.ts:288-296`) prueba ese caso imposible.
- **Propuesta:** una función común `contarDescarga(id)` en el mismo archivo. Mantiene el `try` del `sessionStorage` y llama así:
  ```ts
  void contarDescargaNormativa(id).catch(() => {})
  ```
  `EnlaceDescarga` la llama directo. Se borra el test síncrono. Los demás quedan, pero llaman a la función en vez de usar `renderHook`.
- **Qué se gana:** unas 6 líneas y un test menos, y el nombre deja de prometer un hook. No cambia el comportamiento: sigue sin esperar,
  marca antes de llamar y absorbe el rechazo.

Fuera de mi alcance, pero repetido: `NormativasPublicPage.tsx:25`, `HomePage.tsx:119` y `NormativasAdminPage.tsx:43` usan `isLoading`.
Sin red, la primera carga queda `paused` y la pantalla no muestra nada. Es el mismo patrón que se señaló en talleres; lo dejo para el
revisor.

## Respuesta

1. **Acepto.** Es un commit mecánico. Padrón y logo van a necesitar las mismas piezas, y hoy `normativas` depende de `talleres` sin motivo
   (acoplamiento):
   - `NoEncontrado` pasa a `shared/components/ui/`, con `volverA`;
   - `TallerBuscador` pasa a `shared/components/ui/Buscador.tsx`, con props de etiqueta y placeholder;
   - `normalizar` e `idDeRuta` pasan a `shared/lib/`;
   - `codigos()` pasa a `shared/lib/`.
2. **Acepto.** Lo mismo marcó el revisor. La baja recibe solo el id y borra la ruta que devuelve el `delete ... select`. El mismo patrón en
   recursos queda anotado como brecha y se corrige fuera de este corte.
3. **Acepto.** `contarDescarga(id)` pasa a ser una función común y se borra el test síncrono.
