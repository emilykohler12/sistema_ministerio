# Crítica de la spec · limite-descargas (#26)

Crítico de diseño, 2026-10-29. Leí la spec, `contexto.md`, 0022, 0027, 0030 (sin mergear, está en esta rama), la RPC vigente
(`20261016130000_no_contar_admin.sql`), las guardias globales, `descargas/{errores.ts, useRegistrarDescarga.ts, DescargaModal.tsx}`,
`historial/entidades.ts`, `e2e/` y `playwright.config.ts`. No corrí nada contra la base: lo que digo de Postgres o de Supabase sale de la
documentación y del código, y lo marco cuando no está verificado.

## Veredicto
Hay mejoras

Si solo se cambia una cosa: al pasar el tope, no registrar y responder bien (como con el admin en #25), en lugar de rechazar con `DA006`.
El rechazo no protege nada y le corta la descarga a gente real.

## Puntos

1. **`DA006` bloquea la descarga de usuarios reales y no protege nada** (alta)
   - **Problema.** Con `DA006` el modal se queda en el formulario: la persona no recibe los enlaces. Pero la firma no depende de la RPC.
     0022, 0030 y la definición §666 aceptan que "una ruta visible se firma sin el formulario". Entonces un bot no pierde nada con el
     rechazo: igual llega a los archivos. Los únicos que lo sufren son los usuarios legítimos que comparten una IP:
     - la escuela detrás de un NAT en una jornada institucional, con 40 docentes descargando el taller que acaba de anunciar el Ministerio;
     - el **CGNAT de las operadoras móviles**, donde cientos de clientes comparten una IPv4 pública. 0030 no lo menciona: solo habla de "una escuela".
   - Además, si en el alojado el encabezado resulta ser la IP de un proxy (punto 2), el tope queda global y el modo de falla es un corte de
     las descargas en toda la provincia, no un problema de métricas.
   - **Alternativa.** Pasado el tope, `return` sin insertar, igual que el `if es_admin() then return` de #25: "responde bien, pero no
     registra". El tope sigue cortando el bucle en las métricas, que es lo único que 0030 dice proteger.
   - **Qué se gana.**
     - Desaparecen `DA006`, el criterio 7, `esLimiteDeDescargas`, el mensaje, los cambios en `errores.ts`, el hook y el modal, y sus tres
       archivos de test. El frontend no se toca.
     - Una escuela o un CGNAT que pasa el tope pierde conteos, pero nunca acceso.
     - Un error de encabezado en el alojado se ve como menos descargas, no como una caída del servicio.
   - **Costo.** Pasar el tope no se ve. Con `DA006` tampoco quedaba rastro en la base. Lo que se pierde es solo la queja del usuario, y eso
     lo reemplaza la verificación 4 al desplegar.
   - **¿Reabre 0030?** Es un argumento nuevo: el rechazo no impide el acceso y el CGNAT no aparece en el ADR. Además, 0030 todavía no se
     mergeó, así que cambiar "rechaza con `DA006`" por "no registra" cuesta una línea. La decisión es de ustedes.

2. **El encabezado de IP del alojado no está fijado: 0030 se lo pedía a la spec y la spec lo pasa al deploy** (alta)
   - **Problema.** El criterio 3 sale de lo que hace Kong en local: pisa `x-real-ip` y agrega la IP al final de `x-forwarded-for`. El alojado
     tiene otra cadena (Cloudflare y el gateway de Supabase) y no se comprobó (lo dice `contexto.md`). Si `x-real-ip` o el último elemento
     de XFF traen la IP del borde de Cloudflare o de un salto interno, todo Misiones sale por un puñado de IP y el tope queda **global**.
     Con el diseño actual eso es un corte de las descargas (punto 1).
   - La cadena con fallback empeora las cosas: el fallback (último de XFF) es justo la rama que en local nunca corre, porque `x-real-ip`
     siempre está. Queda sin probar donde importa.
   - Tampoco sé con certeza cuál es el encabezado bueno en el alojado. Lo marco como no verificado: Cloudflare agrega `cf-connecting-ip`,
     y creo recordar que el ejemplo de rate limiting de la documentación de Supabase toma el **primer** elemento de XFF, al revés que acá.
     Con eso alcanza para no adivinar.
   - **Alternativa.** Verificarlo **antes de implementar**. Es una tarea manual, no de agentes, y lleva unos 10 minutos:
     1. En el SQL editor del proyecto de demo (0011), crear una función temporal que devuelva `current_setting('request.headers', true)`, con EXECUTE para `anon`.
     2. Llamarla con curl desde dos redes distintas (la casa y los datos del celular), con y sin `X-Forwarded-For`, `X-Real-IP` y
        `CF-Connecting-IP` falsos.
     3. Borrar la función y anotar el resultado en `contexto.md`.

     Con eso, el criterio 3 nombra **un solo encabezado** (sin cadena) y, si falta, fail-open. La verificación 4 pasa a ser una confirmación.
   - **Qué se gana.** Se cumple lo que 0030 le pidió a la spec, se saca la rama que no se prueba y el riesgo del tope global se descarta
     antes de escribir código, no en producción.
   - **Sobre `ip_cliente()` aparte:** está bien así. Si el encabezado cambia, el arreglo es un `create or replace` de esa sola función, sin tocar
     `registrar_descarga`, y el criterio 3 se prueba directo en pgTAP.

3. **La purga, tal como está escrita, lleva a guardar los hashes de todas las IP para siempre** (alta)
   - **Problema.** El diseño dice "si hay IP, lock por hash, **borra intentos viejos**, cuenta" y justifica la purga con "el índice
     `(ip_hash, fecha_hora)` la hace barata". Ese índice solo sirve si el `delete` filtra por `ip_hash`, así que la spec empuja a purgar
     **solo los intentos de la IP que llama**. Con esa lectura, los intentos de una IP que no vuelve no se borran nunca. La tabla crece
     sin límite y termina siendo un registro permanente de IP seudonimizadas de cada visitante. Es lo contrario de la decisión "la protección
     real es la retención de 10 min".
   - Aun con la purga global, el criterio 4 ("ningún intento vive más de 10 min") es falso. Un intento vive hasta la primera descarga
     posterior a su vencimiento, y en un fin de semana largo eso son días. Un test no puede probar la frase tal como está.
   - **Alternativa.**
     - Escribir la purga global: `delete from intento_descarga where fecha_hora < now() - c_ventana`, sin filtrar por IP. La tabla queda
       acotada a los intentos de los últimos 10 minutos (decenas de filas), así que el seq scan no cuesta nada y no hace falta otro índice.
     - Reescribir el criterio 4 con honestidad: "cada registro borra todos los intentos vencidos, de cualquier IP".
     - Agregar un pgTAP con un intento vencido de **otra** IP que desaparece después de una llamada.
     - La contención no preocupa: dos llamadas que borran la misma fila vieja se esperan un instante y la segunda la saltea.
   - **Sobre el hash sin sal:** está bien así. Un HMAC con un secreto guardado en la misma base no protege de nadie que pueda leer la tabla
     (`postgres`, `service_role`, el panel de Supabase). El sha256 evita que la IP se vea a simple vista y cuesta una llamada. Lo que de
     verdad protege es la retención, y por eso la purga tiene que ser global.

4. **El tope se va a disparar en los e2e y en el desarrollo local, y la spec da por hecho un `db:reset` que el flujo no hace** (media)
   - **Problema.** En local, todas las llamadas llegan con la misma IP, la del gateway de Docker (`172.19.0.1`, según `contexto.md`): los e2e,
     el navegador del desarrollador y curl. La verificación 5 dice "`db:reset` entre corridas, como ya hace el flujo", pero no es así:
     - `qa.md` resetea "si necesitás base limpia" y al terminar;
     - en el carril chico el ingeniero corre `npm run test:e2e` como regresión, sin reset;
     - el qa corre su spec y después la suite completa.

     Con unas 15 llamadas anónimas por corrida, la tercera corrida en 10 minutos, o una sesión iterando sobre `descargas.spec.ts`, pasa el
     tope. Con `DA006` los e2e fallan con un mensaje en pantalla. Con el punto 1, `dashboard.spec.ts` ("3 descargas … se ven") falla por
     un conteo que no cierra, y eso es más confuso todavía.
   - **Alternativa.** Un `globalSetup` de Playwright de unas 10 líneas que use `scripts/lib/supabaseLocal.ts` (el mismo que
     `seed-usuarios.mjs`, que exige que la URL sea local) y vacíe la tabla por REST con la clave de servicio:
     `DELETE /rest/v1/intento_descarga?id=gt.0`. Funciona porque la spec revoca solo a `anon` y `authenticated` y `service_role` saltea la
     RLS. Hay que borrar la frase de la verificación 5.
   - **Qué se gana.** Los e2e son deterministas con cualquier cantidad de corridas, y nadie pierde una tarde con un falso rojo.
   - Esto es además un argumento para dejar la tabla en `public`. Un schema privado ahorraría la excepción de auditoría, la exclusión en
     `entidades.ts` y el cambio en `database.ts`, pero dejaría la limpieza de los e2e sin vía REST. **Tabla en `public`: está bien así.**

5. **`current_setting('request.headers', true)` puede devolver `''`, y `''::json` rompe la RPC** (baja)
   - **Problema.** Si un GUC propio se fijó una vez en la sesión (con `set_config(..., true)` en una transacción anterior), después vale `''`,
     no NULL. Entonces `''::json` da `22P02` y **toda** llamada a `registrar_descarga` falla. Por PostgREST no pasa, porque fija los encabezados
     en cada request. Pero pasa en pgTAP: el caso "sin encabezados no aplica el tope", si viene después de uno que los fijó, se va a escribir
     con `set_config('request.headers', '', true)`. Y pasa en una sesión de psql. Supabase se cuida de esto mismo en `auth.uid()`, que usa
     `nullif(current_setting('request.jwt.claim.sub', true), '')`.
   - **Alternativa.** En `ip_cliente()`, `nullif(current_setting('request.headers', true), '')::json`, más un pgTAP con `''`.
   - Ojo: un `set_config(..., true)` dura hasta el `rollback` final del archivo. Cada caso tiene que fijar sus encabezados, o el de
     "sin encabezados" hereda los del anterior.

6. **Detalles de la migración que la spec da por implícitos** (baja)
   - **Problema.** "`create or replace` con la misma firma (conserva grants)" es cierto, pero `proconfig` se reemplaza. Si no se repiten
     `security definer` y `set search_path = ''`, la RPC queda invoker, `anon` no tiene INSERT y todas las descargas dan `42501`. Lo advierte
     el comentario de `no_contar_admin.sql`, pero la spec no.
   - Lo mismo con "sin EXECUTE para nadie salvo el dueño" en `ip_cliente()`: Supabase da EXECUTE por defecto a `anon`, `authenticated` y
     `service_role`. Hace falta `revoke execute ... from public, anon, authenticated, service_role` explícito, y llamarla desde el definer
     funciona porque el rol actual es el dueño. Exponerla tampoco abriría nada, porque devuelve la IP de quien la llama.
   - **Alternativa.** Una línea en el diseño para cada cosa, y un pgTAP con `has_function_privilege('anon', 'public.ip_cliente()', 'execute')` = false.

7. **Verificación: dos criterios que pgTAP no puede probar como están escritos** (baja)
   - **Criterio 5 (concurrencia).** pgTAP corre en una sola sesión, así que no hay forma de probar dos llamadas simultáneas.
     El lock sí vale la pena: es una línea y hace exacto el tope frente a un bot que manda llamadas en paralelo. Hay que decir que se verifica
     en la revisión, no en un test.
   - **Criterio 1 ("pasados 10 minutos").** `now()` queda fijo dentro de la transacción del test. Hay que sembrar intentos viejos como
     `postgres`, con la misma expresión de hash que la RPC, y fijar el borde: con `fecha_hora > now() - c_ventana`, un intento de hace
     exactamente 10 minutos ya no cuenta. Si no, el test-writer y el implementador van a elegir bordes distintos.
   - **Alternativa.** Agregar esas dos aclaraciones a la verificación. Si se adopta el punto 1, la verificación 2 cuenta filas de
     `registro_descarga` (30 y no 31) en lugar de esperar `DA006`.

8. **Si se mantiene `DA006`: la sexta copia de `codigoDe`** (baja, solo si se descarta el punto 1)
   - **Problema.** `descargas/errores.ts` tiene su propio `codigoDe`. El acuerdo vigente es migrarlo a `codigosDeError` de
     `src/shared/lib/erroresStorage.ts` cuando se toca el dominio (`.claude/rules/datos.md`: los códigos de error van en `shared/lib`).
   - **Alternativa.** Usar `codigosDeError(error).includes('DA006')` en las tres guardas del archivo.

## Lo que está bien así (respuesta a las preguntas puntuales)
- **Orden** validaciones → admin → tope → insert del intento → insert del registro. Es correcto. Como un CHECK que falla revierte también
  el intento, el criterio 2 se cumple solo.
- **Tabla separada** en lugar de una columna `ip_hash` en `registro_descarga`. Con una columna, el hash quedaría para siempre en una tabla
  que el admin lee, y purgarlo sería un UPDATE auditado.
- **Advisory lock, hash sin sal, `ip_cliente()` aparte y tabla en `public`:** ver los puntos 2, 3, 4 y 7.
- **30 cada 10 minutos.** Como orden de magnitud contra un bucle está bien. Con el punto 1, el valor deja de ser delicado: pasarse cuesta
  conteos, no acceso.

## Respuesta

1. **Acepto.** Es un argumento nuevo: el rechazo no impide el acceso (la firma no depende de la RPC) y castiga a quien comparte IP (NAT, CGNAT).
   Pasado el tope, la RPC responde bien sin insertar, como con el admin (#25). Se van `DA006` y todos los cambios del frontend. 0030 se corrige antes de mergear.
2. **Acepto en parte.** Un solo encabezado: `x-real-ip` (el que Kong pisa en local, comprobado), aislado en `ip_cliente()`; sin fallback no probado.
   La verificación en el alojado la hace una persona (los agentes no tocan bases remotas) y es **bloqueante para desplegar la migración**, no para
   implementar: con el punto 1, un encabezado equivocado sub-cuenta en toda la provincia, no corta descargas. Si falla, se cambia solo `ip_cliente()`.
3. **Acepto.** Purga global por `fecha_hora` en cada llamada; criterio 4 reescrito ("se borran en la siguiente llamada anónima"); pgTAP de la IP ajena.
4. **Acepto.** `globalSetup` de Playwright que vacía `intento_descarga` con `supabaseLocal()`.
5. **Acepto.** `nullif(..., '')::json` y un test con `''`; cada caso fija sus encabezados.
6. **Acepto.** Se repiten `security definer` y `search_path`; `ip_cliente()` con `revoke` explícito y `has_function_privilege` en pgTAP.
7. **Acepto.** El criterio 5 se verifica en la revisión; el borde de la ventana se prueba con intentos sembrados.
8. **Sin efecto:** con el punto 1 no hay `DA006`.

## Crítica del código

Crítico de diseño, 2026-10-29. Leí la migración, `limite_descargas.test.sql`, el diff de `auditoria_global`, `e2e/global-setup.ts`,
`playwright.config.ts`, `scripts/lib/{supabaseLocal,entorno}.ts`, `entidades.ts`, el diff de `database.ts` y de los docs, y 0030. Comparé la RPC
con la de `no_contar_admin.sql`. Solo análisis estático: no corrí nada contra la base.

### Veredicto
Hay mejoras, todas chicas. La RPC está bien así.

Si solo se cambia una cosa: el pgTAP de "DA003/DA004 se evalúan antes que el tope" siembra 29 intentos y no distingue el orden. Hay que sembrar 30.

### Puntos

1. **El test del orden DA003/DA004 → tope no prueba el orden** (media)
   - **Problema.** El caso D siembra **29** intentos de `10.0.0.6` y espera `DA003`, `DA004` y `23514`. Con 29, si el tope se evaluara antes de las
     validaciones, la RPC igual seguiría (29 < 30), insertaría el intento y lanzaría `DA003`, que lo revierte. El resultado sería idéntico. El nombre
     del assert ("se evalua antes que el tope") afirma algo que el test no verifica.
   - **Por qué importa.** Es la única regresión de orden que tiene efecto en el usuario. Si un `create or replace` futuro mueve el bloque del tope
     arriba, una IP topeada que pide un taller despublicado recibe un "bien" mudo en lugar de `DA003`. El modal ya no invalida `['talleres']`
     y el error se ve recién en la firma.
   - **Propuesta.** Agregar dos asserts con otra IP que tenga **30** intentos sembrados: `throws_ok(... t_bor ..., 'DA003')` y
     `throws_ok(... PADRON de otra localidad ..., 'DA004')`. El caso D queda como está para "las rechazadas no dejan intento", que sí necesita 29.
     Son 3 líneas y el criterio 2 queda cubierto de verdad.

2. **El `globalSetup` no puede ir a la nube, pero la suite e2e sí, y ahora hay un lugar para impedirlo** (media; previo a esta feature)
   - **Problema.** La limpieza es segura: `supabaseLocal()` lee `supabase status` y lanza si `API_URL` no pasa `esUrlLocal`. Pero el navegador de los
     e2e usa lo que diga `VITE_SUPABASE_URL` en `.env.local` (y `reuseExistingServer: true` reutiliza un `npm run dev` levantado con cualquier
     entorno). Si un `.env.local` apunta al proyecto de demo (0011), la suite escribe allá y el `globalSetup` vacía la base local. La limpieza
     queda muda y nadie se entera de por qué fallan los conteos. Hoy lo único que frena es el login de `admin@dam.local`, y ese usuario puede
     existir en la demo, porque `seed-usuarios.mjs` tiene modo nube.
   - **Propuesta.** En el mismo `globalSetup`, antes de vaciar la tabla, leer `VITE_SUPABASE_URL` con `loadEnv` de Vite (ya es dependencia) y
     lanzar si no pasa `esUrlLocal`. Son unas 3 líneas y reusan la guardia existente. Con eso se cumple "nunca conectes agentes a la base de producción"
     para toda la suite, no solo para la limpieza. Si no entra en este corte, va como issue (0026).

3. **El pgTAP arrastra el andamiaje de la fase RED** (baja)
   - **Problema.** `n_ip`, `n_nuevos`, `n_hash_invalidos` e `ip()` usan SQL dinámico con `exception when undefined_table/undefined_function`
     y valores centinela (`-1`, `'<no existe>'`), además de `coalesce(...)` y `to_regclass(...) is not null` en los asserts de estructura.
     Servía para que el archivo no abortara antes de que existiera la tabla, pero ya no: ningún otro test del repo lo hace. Ahora es código
     muerto que oculta el error real (un `-1` en lugar de `relation does not exist`). Además, `n_hash_invalidos` mezcla "tabla vacía" con
     "tabla inexistente".
   - También, `n_reg(loc)` cuenta `registro_descarga` solo por `localidad_id` (10 a 25). Si alguien descargó a mano en la base local en
     una de esas localidades, los `is(n_reg(..), 0)` fallan sin que haya un bug. `descargas.test.sql` tiene el mismo patrón, así que no es nuevo.
   - **Propuesta.** Reescribir los helpers como funciones `language sql` con SQL estático, y que `n_reg` filtre además por
     `taller_id = current_setting('test.t_pub')::int` (el taller se crea en la transacción). Se gana un archivo más corto, errores que dicen lo que
     pasa y asserts que no dependen de los datos de la base local.

4. **El bloqueo "verificar `x-real-ip` antes de desplegar" vive solo en la spec y en 0030** (baja)
   - **Problema.** La verificación 4 es un paso manual que bloquea el `db push`. Ningún mecanismo lo recuerda: cuando se cierre #26 con
     `Closes #26`, la spec queda archivada y el paso se olvida.
   - **Propuesta.** Abrir un issue "Verificar el encabezado de IP en el alojado antes de desplegar `limite_descargas`", asignado a quien despliega
     (0026: el trabajo pendiente vive en issues). Cuesta un minuto.

### Lo que está bien así
- **Cuerpo de la RPC.** Es idéntico al de `no_contar_admin.sql` más el bloque nuevo. `security definer` y `search_path = ''` están repetidos, todos
  los objetos propios están calificados con `public.`, y `sha256`, `convert_to`, `hashtextextended` y `pg_advisory_xact_lock` son de `pg_catalog`,
  así que resuelven con el `search_path` vacío.
- **Orden lock → purga → conteo.** En READ COMMITTED cada sentencia toma un snapshot nuevo. Por eso el `count` que corre después de
  obtener el lock ve el intento ya commiteado por quien tenía el lock antes, y el tope es exacto. La purga global bajo locks por IP distintos
  no forma ciclos: todas recorren la tabla en el mismo orden físico y solo se esperan en las filas vencidas que comparten. El filtro
  `fecha_hora > now() - c_ventana` del conteo parece redundante con la purga, pero fija el borde y no estorba.
- **`ip_cliente()` con `revoke` a los cuatro roles.** Que figure en `database.ts` no abre nada, porque llamarla da `42501`.
  No vale la pena moverla a otro schema.
- **Excepción `('intento_descarga', 28)`** con su justificación, y la exclusión en `entidades.ts`: es la mínima que pide el `Record` exhaustivo.
- **`globalSetup` en sí.** Usa la guardia existente, el filtro `id=gt.0` satisface a `safeupdate` y `service_role` borra sin política
  porque saltea la RLS. No necesita más.

### Respuesta a la crítica del código

1. **Acepto** (coincide con el revisor). `throws_ok` de `DA003` y `DA004` con una IP en el tope (30 sembrados).
2. **Acepto.** Es anterior a esta feature, pero el `globalSetup` es nuestro y la guardia son 3 líneas: lanzar si `VITE_SUPABASE_URL` no pasa `esUrlLocal`.
3. **Acepto.** Se quita el andamiaje RED (SQL estático, sin centinelas) y `n_reg` filtra también por taller. Barato y hace legible el test.
4. **Acepto.** Issue aparte para la verificación del encabezado en el alojado (0026).
Además, observación del revisor: test de privilegios sobre `intento_descarga_id_seq`.
