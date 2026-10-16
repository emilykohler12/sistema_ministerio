# Crítica del plan: no contar las descargas del administrador (#25)

## Veredicto
Hay mejoras (chicas). El enfoque es el correcto: un `if public.es_admin()` dentro de las dos RPC definer, sin tocar el cliente.

Si solo se cambia una cosa: el paso 1 tiene que **modificar** tres tests que ya existen (uno queda en rojo y dos no distinguen nada),
en vez de agregar casos que ya están.

## Verificado y sin cambios

- **`es_admin()` dentro de `security definer`:** funciona. `auth.jwt()` lee el GUC `request.jwt.claims`, que no cambia con el
  `current_user` del definer. El EXECUTE de `es_admin()` se chequea con el dueño (`postgres`), así que no hay grant que agregar.
  Con `service_role` (scripts) da falso y cuenta, lo cual está bien.
- **Descarte de B (marca y filtro en `metricas_registros`):** es correcto. Además, B no sirve para normativas: un contador no se
  puede marcar sin una tabla de eventos, que es otra brecha. Agrega una columna, un cambio en la auxiliar de 0024 y datos del admin
  que nadie va a consultar.
- **Descarte de C (rechazar con error):** es correcto. El modal pasa al paso 2 solo si el registro responde bien, así que C obliga a
  tocar `useRegistrarDescarga`, `errores.ts` y el modal para un caso que no es un error.
- **Cliente:** con la RPC respondiendo bien, `useRegistrarDescarga` marca el taller en `visita.ts` y `useContarDescarga` marca la
  normativa. Es inofensivo, porque marca algo que no se contó y quien sigue en esa pestaña es la misma persona. No hace falta tocarlo.
- **Una alternativa solo en el cliente** (no llamar a la RPC si `esAdmin`) es peor: `esAdmin.ts` es solo UX, son dos lugares en vez
  de uno y no se puede probar con pgTAP.
- **e2e existentes:** `descargas.spec.ts` y `dashboard.spec.ts` descargan desde contextos anónimos (`browser.newContext()`), así que no se rompen.
- **`metricas.test.sql`** inserta las filas como `postgres`, sin la RPC, así que no lo afecta.

## Puntos

1. **El paso 1 no menciona los tests existentes que el cambio rompe o vuelve inútiles** (media). Propuesta: que el rojo salga de editarlos:
   - `normativas.test.sql:635-638` espera `descargas = 2` ("el contador sumó 2 (anon y admin)"). Con el cambio, el valor correcto es 1.
     Cambiar el esperado y la descripción ya es el test en rojo del contador del admin. No hace falta otro.
   - `normativas.test.sql:397-399` ("admin: contar_descarga_normativa funciona") queda como `lives_ok`, con otra descripción
     ("no falla, pero no cuenta").
   - `normativas.test.sql:296-308` ya prueba que "anon sigue sumando" (`N Contador` = 1). El plan lo pide como test nuevo y estaría duplicado.
   - `descargas.test.sql:501-504` ("sin marca: authenticated también puede registrar_descarga") ya existe, pero solo es un `lives_ok`:
     también pasaría con una implementación que filtre por `auth.uid() is not null` o por rol `authenticated`, que es justo el error
     que el plan quiere atrapar. Hay que agregarle un `results_eq` que confirme que existe la fila con `localidad_id = 7`, en lugar de
     escribir un caso nuevo.

   Qué se gana: el rojo prueba lo que cambia, sin tests duplicados ni un rojo sorpresa en `normativas.test.sql`.

2. **"Las validaciones se mantienen" es inexacto y puede llevar a una implementación mala** (media). `DA003` y `DA004` se mantienen
   si el `return` del admin va justo antes del `insert`. Pero los CHECK de la tabla (cargo fuera de la lista, "Otro" en blanco, PADRON
   sin establecimiento → `23514`) solo se evalúan al insertar, así que un admin con datos inválidos recibe éxito. Si alguien escribe
   un test "admin con cargo inválido da 23514" para respetar la frase, la única forma de hacerlo pasar es insertar y después borrar
   o hacer rollback de un savepoint. El `delete` dispara `auditar()` (deja un DELETE del admin en `registro_operacion`) y consume la
   secuencia. Propuesta: escribir en el plan y en el comentario de la RPC "valida `DA003`/`DA004` y, con sesión de admin, vuelve
   antes del `insert`: los CHECK no se evalúan, porque el zod del formulario aplica las mismas reglas", y no pedir tests de `23514`
   para el admin. Qué se gana: la frase deja de pedir algo que solo se logra con un rodeo que ensucia la auditoría.

3. **El plan no fija dónde va el chequeo en `registrar_descarga`** (baja). Propuesta: `if public.es_admin() then return; end if;`
   después del bloque `DA004` y antes del `insert`. Así se mantiene el orden de errores que fijan los tests (`DA003` antes que `DA004`).
   Los tests del admin deben ser en el bloque `-- admin` (líneas 509-528), con una marca propia (por ejemplo `localidad_id = 8`) y
   `count = 0` leído como admin, que tiene SELECT. Con eso alcanza para el caso válido, el `DA003` (taller en borrador) y, por una
   línea más, el `DA004`. Recordar subir el `plan(n)`.

4. **`contar_descarga_normativa` puede quedar en `language sql`** (baja). Propuesta: `where id = p_id and not (select public.es_admin())`,
   sin pasarla a plpgsql. El `create or replace` conserva el dueño y los grants. Lo que sí hay que repetir es `security definer` y
   `set search_path = ''`, porque `proconfig` se reemplaza (los tests de estructura existentes lo detectarían). Volver a escribir los
   `revoke`/`grant` no hace daño, pero no es necesario. Qué se gana: un diff de una línea y la misma forma que hoy.

5. **El plan no dice qué verifica el `qa`** (baja). 0023 lo exige, porque es una RPC que llama un visitante. Pero el `qa` no puede contar filas
   (no tiene `psql`), así que sin una consigna no tiene qué mirar. Propuesta: indicarle un e2e por el dashboard. Con la sesión de admin
   en el mismo contexto: leer el KPI de descargas, descargar un taller desde el portal y abrir una normativa, recargar `/admin` y
   confirmar que no cambió. Después, una descarga anónima que lo suba en 1, para probar que el tablero no está mostrando una caché.
   Qué se gana: es la única verificación de punta a punta de que la sesión del navegador llega a la RPC con el JWT del admin, algo que pgTAP no cubre.

## Respuesta

1. **Acepto.** El rojo sale de editar `normativas.test.sql:635-638` (esperado 1), `:397-399` (descripción) y de sumar un `results_eq`
   a `descargas.test.sql:501-504`. Saco del plan el caso duplicado de anon.
2. **Acepto.** Ningún CHECK se evalúa para el admin: insertar y después borrar ensuciaría la auditoría, y zod ya cubre esas reglas.
   Queda escrito en el plan y en el comentario de la RPC.
3. **Acepto.** El `return` va después de `DA004` y antes del `insert`. Los tests van en el bloque `-- admin` con su propia marca.
4. **Acepto.** La función sigue en `language sql`, con el filtro en el `where`.
5. **Acepto.** El e2e del `qa` compara el KPI del dashboard antes y después de que el admin descargue, y después hace una descarga anónima.
