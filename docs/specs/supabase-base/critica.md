# Crítica: supabase-base

Crítica de `spec.md` y `contexto.md`. Leí los ADR 0004, 0005, 0011 y 0012, la crítica de `estructura-carpetas`
(no la reabro), `.claude/settings.json`, `.claude/hooks/`, los perfiles de `.claude/agents/`,
`.claude/rules/migraciones.md` y la definición §8.3 y §8.4. Respeto las decisiones de la entrevista. Los
hallazgos 1 a 3 son cambios a la spec. Al final respondo las preguntas puntuales.

## Hallazgos

### 1. `auditar()` rompe en tablas sin `id`, y "nadie puede modificar `registro_operacion`" depende de RLS, que no alcanza

- **Problema:**
  - **Tablas sin `id`:** si el trigger lee `NEW.id`, cualquier escritura en una tabla puente
    (`taller_etiqueta`, `taller_destinatario`, `normativa_etiqueta`, todas con PK compuesta, §8.3) falla con
    `record "new" has no field "id"`. No solo se pierde la auditoría: **la escritura del admin aborta**. Además,
    §8.3 declara `registro_id NOT NULL`.
  - **Privilegios:** Supabase da por defecto `GRANT ALL` sobre las tablas de `public` a `anon`, `authenticated`
    y `service_role`, incluido `TRUNCATE`. Que no haya políticas frena INSERT/UPDATE/DELETE de `anon` y
    `authenticated`, pero hay tres huecos. `service_role` tiene `BYPASSRLS`, así que una Edge Function con la
    clave de servicio puede reescribir el historial. `TRUNCATE` no pasa por RLS. Los triggers de fila no se
    disparan con `TRUNCATE`. Hoy PostgREST no expone `TRUNCATE`, pero una RPC futura sí podría.
  - **`SECURITY DEFINER`:** es lo correcto y además necesario, porque sin él el INSERT del trigger lo frena la
    misma RLS. Le falta higiene: por defecto también recibe `EXECUTE` para `anon`/`authenticated`.
  - **"El diff":** es ambiguo y el criterio 5 no se puede verificar así. Calcular un diff es código de más.
- **Alternativa:**
  - `registro_id` nullable, tomado de `to_jsonb(coalesce(NEW, OLD)) ->> 'id'`. En las tablas puente queda NULL
    y la clave compuesta igual queda en los datos. No hace falta pasar argumentos al trigger.
  - Guardar `datos_anteriores = to_jsonb(OLD)` y `datos_nuevos = to_jsonb(NEW)` completos, sin diff.
  - En la migración base: `revoke all on registro_operacion from anon, authenticated, service_role;` y
    `grant select on registro_operacion to authenticated;`, con la política de SELECT para `es_admin()`. El
    trigger inserta igual porque la función es del dueño de la tabla. `auditar()` lleva `set search_path = ''`
    y `revoke execute ... from public, anon, authenticated` (los triggers no chequean `EXECUTE` al dispararse).
  - `usuario_id` con FK a `auth.users` sin `on delete set null`. El `RESTRICT` por defecto obliga a usar el ban
    en lugar de borrar (0005) y evita que un usuario borrado se confunda con "sistema".
  - Dejar escrito en la skill que `TRUNCATE` no se audita, y que cada corte de dominio hace
    `revoke truncate ... from anon, authenticated` sobre sus tablas.
- **Severidad:** alta. Con `NEW.id`, el primer corte que tenga etiquetas no puede guardar. Sin los `revoke`,
  "append-only" depende de que nadie use la clave de servicio.
- **Recomendación:** corregir el diseño como se describe arriba, actualizar §8.3 (`registro_id` también
  nullable) y reescribir el criterio 4 así: "`anon`, `authenticated` y `service_role` no pueden INSERT, UPDATE,
  DELETE ni TRUNCATE; el admin puede SELECT".

### 2. Los permisos de agentes que propone la spec no coinciden con los perfiles reales, y dejan un hueco en el carril feature

- **Problema:**
  - **Implementador:** no tiene hook `limitar-bash` (solo `test-writer`, `revisor`, `Explore` y `critico`).
    "Permitir al implementador" no cambia nada.
  - **Test-writer:** **no puede escribir pgTAP**. `limitar-escritura.mjs tests` solo acepta `*.test.ts(x)`, y
    `supabase/tests/base.test.sql` no coincide. En el carril feature, el RED de los criterios 3 a 6 queda
    bloqueado.
  - **Revisor con `db:types`:** regenera `src/shared/types/database.ts` por shell, o sea que escribe código, y
    eso contradice su rol ("no modificás código").
  - **Argumentos extra:** si la regla de `limitar-bash` no está anclada al final, `npm run db:reset -- --db-url
    postgres://...` pasa. Y `--db-url` tampoco está en el deny: `supabase db reset --db-url <producción>` borra
    la base remota sin `--linked` ni `push`.
  - **Deny por prefijo en `settings.json`:** se saltea con `npm exec supabase`, `./node_modules/.bin/supabase`
    o `env X=1 npx supabase`.
  - **Exclusión del formateo:** sacar `database.ts` de `formatear.mjs` no hace nada, porque `db:types` escribe
    por shell y el hook solo ve Edit/Write.
- **Alternativa:**
  - Agregar `/^supabase\/tests\/.+\.sql$/` al perfil `tests` de `limitar-escritura.mjs`.
  - Sumar al perfil `checks` de `limitar-bash.mjs` solo `^npm run (db:reset|test:db)$`, anclado. El
    test-writer lo necesita para confirmar el RED y el revisor para verificar. `db:types` queda para el agente
    principal y el implementador.
  - Mover el bloqueo remoto a `proteger-bash.mjs`, que ve cualquier forma de invocarlo: un regex
    `\bsupabase\b.*(\s--linked\b|\s--db-url\b|\bdb push\b|\blink\b|\blogin\b)`. Las dos líneas de
    `settings.json` pueden quedar como respaldo.
  - En `proteger.mjs`, bloquear Edit/Write sobre `database.ts` ("se regenera con `npm run db:types`") en lugar
    de excluirlo del formateo.
- **Severidad:** media-alta. El hueco del test-writer frena el flujo. Lo de `--db-url` es el único camino de un
  agente hacia una base remota (CLAUDE.md: "nunca conectes agentes a la base de producción").
- **Recomendación:** reemplazar el bullet "Hooks" de la spec por estos cuatro cambios.

### 3. Hay criterios que no se pueden verificar o que verifican lo que no importa, y faltan dos tests baratos

- **Problema:**
  - **Criterio 2:** "existen los usuarios" no prueba que se pueda iniciar sesión, y eso es justo lo frágil del
    seed (ver la respuesta sobre el seed).
  - **Criterio 4:** "nadie" es falso hoy (hallazgo 1).
  - **Criterio 5:** "el diff" (hallazgo 1).
  - **Criterio 3:** no prueba lo que más importa de `es_admin()`, que no se pueda falsificar desde
    `user_metadata`, que el usuario sí puede editar.
  - **Criterio 1:** "sin realtime ni analytics" no dice cómo se comprueba.
  - **Registro público:** no hay ningún criterio que diga que está deshabilitado.
  - **RLS:** no hay ningún guardia de la regla de 0004 ("RLS activado en todas las tablas"), que todos los
    cortes futuros van a necesitar.
- **Alternativa:**
  - **Criterio 2:** "con `admin@dam.local` y su contraseña de desarrollo, `POST /auth/v1/token?grant_type=password`
    devuelve 200 y el JWT trae `app_metadata.admin = true`".
  - **Criterio 3:** sumar el caso "JWT con `user_metadata.admin = true` y sin `app_metadata` → false". Los tests
    pgTAP simulan el JWT con `set local role authenticated` + `set local request.jwt.claims = '…'` y **no
    dependen del seed**.
  - **Criterio 5:** sumar una tabla de prueba con PK compuesta, además de la que tiene `id`.
  - **Criterio nuevo:** un test pgTAP que falla si alguna tabla de `public` tiene `rowsecurity = false`. Cuesta
    una consulta y protege a todos los cortes.
  - **Registro público:** "`POST /auth/v1/signup` devuelve error". Anotar en el checklist del proyecto de demos
    (0011) que `config.toml` **no** se aplica a la nube: hay que desactivar el registro en el dashboard. Ya hay
    defensa en profundidad, porque un usuario registrado no tiene la marca y `es_admin()` lo rechaza.
  - **Criterio 1:** "`npx supabase status` no lista realtime ni analytics".
- **Severidad:** media.
- **Recomendación:** reescribir los criterios 1 a 5 como se indica y agregar el test de RLS global.

## Respuestas a las preguntas

- **¿`SECURITY DEFINER` y la RLS alcanzan?** El `SECURITY DEFINER` sí, pero con `search_path` vacío y sin
  `EXECUTE` para los roles de la API. La RLS sola no alcanza. Hacen falta los `revoke`, porque `service_role`
  la saltea y `TRUNCATE` no pasa por ella. Para las tablas sin `id`, `to_jsonb(...) ->> 'id'` (hallazgo 1).
- **¿El seed en `auth.users` es robusto entre versiones del CLI?** No mucho. El esquema de `auth` cambia con
  GoTrue: columnas de token que tienen que ser `''` y no NULL (si no, el login falla con "Database error
  querying schema"), la fila en `auth.identities` con `provider_id`, y `extensions.crypt` con
  `gen_salt('bf')`. Si se mantiene en SQL, conviene seguir la receta completa y usar el criterio 2 reescrito
  como alarma. La alternativa robusta es un script Node de unas 15 líneas que llame a
  `auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { admin: true } })` con la clave
  de servicio local, al final de `db:reset`: usa la API pública y no el esquema interno. Para esta spec,
  cualquiera de las dos sirve si los tests pgTAP no dependen del seed.
- **¿`supabase.ts` y `database.ts` ahora?** `noUnusedLocals` es por archivo: un módulo que nadie importa no
  rompe `tsc` ni oxlint. `database.ts` y `db:types` sí van ahora, porque prueban el circuito de generación, los
  ignores y el typecheck. `supabase.ts` (y el criterio 8, `vite-env.d.ts` y `.env.example`) conviene llevarlo
  al primer corte de dominio. La decisión de "lanzar al importar" afecta a qué tests cargan el módulo de forma
  transitiva, y se decide mejor con un consumidor real. Se ahorra un test con `vi.stubEnv` + `vi.resetModules`
  de un archivo que nadie usa. Es baja prioridad: si lo dejan, no hace daño.
- **¿Un PR o dos?** Dos. El PR 1 es el entorno: Dev Container, CLI, `config.toml`, scripts, `.gitignore`,
  hooks y la skill. Se verifica con `db:start` y con `db:reset` sin migraciones. El PR 2 es la migración base,
  el seed, pgTAP y `database.ts`. Se gana que el PR 1 obliga a las dos personas a reconstruir el contenedor
  (WSL2, `privileged`, 2-3 GB), y si falla por el entorno no frena la revisión del SQL de seguridad. Además, los
  cambios de permisos se revisan aislados.
- **Una simplificación del Dev Container:** la feature `docker-in-docker` ya declara el volumen
  `/var/lib/docker` y `privileged`. No hace falta agregar el volumen a mano: basta con declarar la feature y los
  puertos.

## Veredicto

**Hay mejoras.** El alcance está bien elegido: transversal y sin tablas de dominio. Antes de aprobar:
1. Que `auditar()` funcione con tablas sin `id`, guarde OLD/NEW completos, y que `registro_operacion` sea
   append-only por privilegios y no solo por RLS.
2. Alinear los permisos con los perfiles reales: test-writer con `.sql`, `db:types` fuera del revisor, scripts
   anclados y bloqueo de `--db-url`/`link` en `proteger-bash.mjs`.
3. Criterios verificables: login real del seed, `user_metadata` no falsificable, guardia de RLS global y
   registro deshabilitado.
4. Dividir en dos PRs y llevar `supabase.ts` al primer corte de dominio.

## Respuesta

1. **Acepto.**
   - `registro_id` nullable, obtenido con `to_jsonb(coalesce(NEW, OLD)) ->> 'id'`. Se guardan OLD y NEW
     completos, sin diff.
   - `revoke all` a `anon`, `authenticated` y `service_role`, más `grant select` a `authenticated` con la
     política `es_admin()`.
   - `auditar()` con `search_path = ''` y `revoke execute`.
   - FK de `usuario_id` sin `set null`.
   - Se actualiza §8.3. Que `TRUNCATE` no se audita queda escrito en la skill.
   - Error mío: había asumido que todas las tablas tienen `id`, y el diseño con tablas puente lo contradice.
2. **Acepto.** Leí mal los perfiles. Queda así:
   - test-writer puede escribir `supabase/tests/*.sql`;
   - `checks` permite solo `^npm run (db:reset|test:db)$`, anclado;
   - el bloqueo de bases remotas (`--linked`, `--db-url`, `db push`, `link`, `login`) pasa a `proteger-bash.mjs`;
   - `database.ts` queda protegido contra Edit/Write.
   Cumple lo que pidió el usuario (habilitar comandos locales puntuales a los subagentes) y lo hace más seguro.
3. **Acepto** los criterios reescritos, el guardia global de RLS y el test de registro deshabilitado. La nota
   de que `config.toml` no se aplica a la nube va al checklist de demos.
4. **Acepto:**
   - dos PRs, que en la spec quedan como fases A (entorno) y B (migración base);
   - `supabase.ts`, `vite-env.d.ts` y `.env.example` pasan al primer corte de dominio;
   - el volumen de Docker no se declara a mano.
   Para el seed elijo el script Node con `auth.admin.createUser` en lugar de SQL sobre `auth.users`: usa la API
   pública y no se rompe si el CLI cambia el esquema interno de `auth`.

# Crítica del código (Fase A)

> El pedido era escribir esto en `critica-codigo-fase-a.md`, pero el perfil `critico` de `limitar-escritura.mjs`
> solo deja escribir `critica.md`. Por eso va como sección al final de este archivo.

Alcance: el working tree de `chore/supabase-entorno` (hooks, `tsconfig.app.json`, `src/test/hooks/hooks.test.ts`,
`.gitignore`, `supabase/`). No se reabren decisiones de la spec ni se mira la Fase B.

## Veredicto
Hay mejoras. El resto está bien así: `devcontainer.json`, los scripts de `package.json`, `limitar-*.mjs` y la skill
siguen la spec sin agregar nada. `config.toml` es el que genera `supabase init`, con los tres cambios pedidos.

## Puntos

### 1. `proteger-bash.mjs`: separar en segmentos y detectar `bash -c`/`eval` suma código y aun así no cubre el anidado
- **Problema.** El bloqueo de bases remotas reutiliza `analizarComando`, que reemplaza las comillas por `Q`. Como el
  contenido entrecomillado desaparece, hace falta un caso aparte (`anidado`) que vuelve a revisar el comando crudo, pero
  solo cuando el segmento *empieza* con `sh`, `bash`, `zsh`, `dash` o `eval`. Es una lista de lanzadores que nunca va a
  estar completa. Lo probé en el working tree: todos estos devuelven 0 (permitido).
  `bash -c 'npx supabase link'`, `env sh -c '...'`, `timeout 60 bash -c '... db push'`, `sudo bash -c '...'` y
  `npx -c 'supabase login'`. En el primer caso, que es justo el que el código quiere cubrir, falla el
  `(?=\s|$)` porque detrás de `link` viene `'`. Este bug en sí le toca al revisor. Lo que me importa acá es lo que
  muestra: hay dos niveles de análisis y ninguno es correcto.
- **Alternativa.** Para esto no hace falta separar en segmentos. Alcanza con una sola regex sobre el comando crudo:
  "una invocación de supabase o de `npm run db:*`/`test:db` seguida, en el mismo comando simple, de una marca remota".
  ```js
  const REMOTO = /(?:\bsupabase\b|\bnpm run (?:db:|test:db))[^;&|\n]*?(?:\s--(?:linked|db-url)\b|\sdb\s+push\b|\s(?:link|login)(?![\w-]))/
  if (REMOTO.test(cmd)) block('...')
  ```
  Así desaparecen `REMOTO_FLAGS`, `REMOTO_SUBCOMANDOS`, `usaSupabase`, `remoto` y `anidado`. El bloque vuelve a quedar
  antes de `analizarComando`, junto al chequeo de `.env`, que funciona igual: regex sobre el texto crudo.
- **Qué se gana.** Pasan de 6 a 2 líneas. Ya no depende de cómo se quitan las comillas, y cubre cualquier lanzador
  (`env`, `sudo`, `timeout`, `xargs`, `npx -c`, `find -exec`) sin enumerarlos. La probé en el scratchpad con los 5 casos
  de bloqueo y los 4 permitidos de `hooks.test.ts`, más los 5 anidados de arriba: todos dan lo esperado. También dan
  bien `--db-url=...`, `supabase --workdir . link` y `gen types ... > src/link.ts` (permitido). El costo es un falso
  positivo raro: un `git commit -m 'fix: supabase link roto'` queda bloqueado. `'feat: login con supabase'` pasa,
  porque `login` va antes de `supabase`. Si el agente se topa con ese caso, reformula el mensaje. Además conviene sumar
  2 casos anidados a `hooks.test.ts`.
- **Severidad:** alta. Es el criterio 3 ("en cualquier forma de invocación") y hoy no se cumple.
- **Recomendación:** cambiarlo antes del PR de Fase A.

### 2. `"node"` en `tsconfig.app.json` le da tipos de Node a todo el código del navegador por un solo test
- **Problema.** Con `types: ["vite/client", "node"]`, el código de `src/` compila aunque use `process`, `Buffer`,
  `require` o `node:fs`. Ese error hoy se ve en `typecheck` y pasaría a verse recién en el navegador. Todo eso para que
  compile un archivo que no es código de la app.
- **Alternativa.** Volver `tsconfig.app.json` a `types: ["vite/client"]` y agregarle `"exclude": ["src/test/hooks"]`.
  Sumar `"src/test/hooks"` al `include` de `tsconfig.node.json`, que ya tiene `types: ["node"]` y `lib` sin DOM, como
  corresponde a un test que lanza procesos. Lo verifiqué con dos configs equivalentes en el scratchpad: las dos pasan
  `tsc --noEmit`. `tsc -b` sigue cubriendo todo, porque `tsconfig.json` referencia a los dos. Opcional: agregar
  `// @vitest-environment node` al test, que no usa DOM y hoy corre en jsdom.
- **Ubicación.** `src/test/hooks/` está bien. Pasarlo a `.claude/hooks/` como `.test.mjs` lo dejaría junto al código,
  pero obliga a tocar el `include` de vitest y el perfil `tests` de `limitar-escritura` (hoy solo acepta
  `.test.tsx?`). Además, editar `.claude/` pide permisos extra. Sale más caro de lo que aporta.
- **Severidad:** media.
- **Recomendación:** hacer el cambio de 2 líneas en los tsconfig y dejar el test donde está.

### 3. Hay reglas para `.env` y para `supabase/` que no hacen nada: una excepción que nunca se aplica y un `.gitignore` duplicado
- **Problema.**
  - En `proteger.mjs`, la excepción para `.env.example` nunca llega a aplicarse: el deny `Edit(./.env.*)` de
    `settings.json` gana igual. Encima, `.env.example` lo crea el primer corte de dominio (Respuesta 4 de la crítica
    de la spec), no esta fase. El test "permite .env.example" verifica algo que en la práctica no ocurre.
  - En el `.gitignore` raíz, el bloque `# Supabase local` repite lo que ya está en otros lados:
    `supabase/.temp` y `supabase/.branches` ya los ignora `supabase/.gitignore`, que genera el CLI, y
    `supabase/functions/.env` ya lo cubre la línea `.env` de siempre, que sin `/` aplica a cualquier profundidad.
- **Alternativa.**
  - Sacar la excepción de `proteger.mjs` y su test, y dejar una sola regla: los agentes no tocan ningún `.env*`. Cuando
    llegue el primer corte, la persona escribe `.env.example` a mano (son 2 variables `VITE_SUPABASE_*`), igual que
    `.env`. La otra opción, sacar el deny de `settings.json` y sumar `Read` al matcher de `proteger.mjs`, cambia el
    modelo de permisos por un archivo de 2 líneas.
  - Borrar las 4 líneas del bloque `# Supabase local` del `.gitignore` raíz.
- **Qué se gana.** Cada regla queda en un solo lugar y el código coincide con lo que de verdad pasa. Es un argumento
  nuevo: la spec no sabía que el deny tapa la excepción ni que el CLI genera su propio `.gitignore`.
- **Severidad:** baja.
- **Recomendación:** hacerlo en este mismo PR, son borrados.

## Respuesta (código, Fase A)

1. **Acepto la idea, con una corrección.** Uso una sola regex sobre el comando crudo, pero la propuesta no cubre
   `npx supabase "link"` ni `db --debug push` (`revision-fase-a.md`). La regex final también admite una comilla, `=` o `(`
   antes de la marca, y bloquea las palabras sueltas `push`, `pull`, `dump`, `repair` e `inspect`, y los flags
   `--project-ref` y `--project-id`. Límite aceptado: los argumentos que llegan por stdin (`xargs`). La barrera real es
   que en el contenedor no exista ninguna credencial remota.
2. **Acepto.** `src/test/hooks` pasa a `tsconfig.node.json`.
3. **Acepto.** Se saca la excepción de `.env.example`, que nunca se aplicaba, y el bloque duplicado del `.gitignore`.
   Se conservan `.env.*` y `!.env.example`.

# Crítica del código (Fase B)

Alcance: el working tree de `chore/supabase-base` (`supabase/migrations/20261010003733_base.sql`,
`scripts/seed-usuarios.mjs`, `package.json`, `supabase/config.toml`, §8.3 y `supabase/tests/*.test.sql`). No reabro
decisiones de la spec. Leí 0005 y la definición §8.4 y §9.1. No pude correr los tests porque el Supabase local no
estaba levantado.

## Veredicto
Hay mejoras. Lo demás está bien así:
- `es_admin()`: `stable`, `search_path = ''`, compara texto y la política la envuelve en `(select ...)`.
- Privilegios de `registro_operacion`: `revoke all` + `grant select` + política.
- El seed: usa la API pública, es idempotente, y la guarda de URL local cuesta una línea.
- `db:types` con `.tmp` + `mv`, que no deja `database.ts` vacío si falla la generación.
- El desvío de `[auth.email] enable_signup = true`: el registro público lo sigue apagando `[auth] enable_signup = false`.

## Puntos

### 1. `auditar()` traga cualquier error y pierde auditoría sin que nadie se entere. El fallback de FK además contradice la FK
- **Problema.**
  - **Origen de "nunca aborta".** El criterio 7 nació del hallazgo 1 de la crítica de la spec: con `NEW.id`, las
    tablas puente hacían abortar la escritura. Eso ya lo resuelve `to_jsonb(...) ->> 'id'`. El código fue más lejos
    y lo leyó como "ningún error de auditoría puede abortar", que es otra regla.
  - **Contradice §9.1 y 0005.** §9.1 dice que la auditoría se cumple "sin importar desde dónde llegue el cambio".
    Con `when others` puede pasar que la escritura se confirme y el registro no exista. El `raise warning` va al log
    de Postgres. PostgREST no se lo pasa al cliente y nadie lee ese log, así que la pérdida es silenciosa.
  - **El fallback de FK es justo el caso que la FK quería evitar.** La migración explica que la FK no lleva
    `set null` "para que no se confunda un usuario borrado con sistema". Pero en el fallback, un `sub` que no está en
    `auth.users` queda grabado con `usuario_id = NULL`, o sea como "sistema". El único caso real es un usuario borrado
    que todavía tiene un JWT vigente. Para ese caso, que la escritura falle es lo correcto, no un problema.
  - **El resto de `others` casi no atrapa nada.** Fuera de la FK, `operacion` y `tabla` nunca violan sus
    restricciones. Lo que queda son fallas graves (disco lleno, un bug del esquema), y en esos casos conviene fallar.
    Además, `others` no atrapa `query_canceled`.
  - **Cada bloque `begin/exception` abre una subtransacción por fila.** En una carga masiva, por ejemplo la carga
    inicial del padrón (§4), son miles de subtransacciones.
- **Alternativa.** Sacar los dos bloques `exception` y dejar la falla cerrada:
  ```sql
  begin
    insert into public.registro_operacion (usuario_id, operacion, tabla, registro_id, datos_anteriores, datos_nuevos)
    values (auth.uid(), tg_op, tg_table_name, v_registro_id, v_anteriores, v_nuevos);
    return coalesce(new, old);
  end;
  ```
  Habría que reescribir el criterio 7 así: "la escritura no aborta por la forma de la tabla (sin `id`); si el
  registro falla, la escritura falla". En `auditar.test.sql`, los dos `lives_ok` del `sub` inexistente pasan a
  `throws_ok(..., '23503')`.
- **Qué se gana.**
  - Unas 20 líneas menos de PL/pgSQL de seguridad.
  - Se cumple la garantía de §9.1: no hay escritura sin su registro.
  - El "sistema" (`NULL`) vuelve a significar solo "sin sesión".
  - No hay subtransacciones por fila.
  - Es un argumento nuevo: la spec no decidió tragar errores. Solo decidió que la falta de `id` no aborte.
- **Severidad:** media-alta. Hoy no se pierde nada, pero la regla queda débil de forma permanente y nadie se va a
  enterar cuando falle.
- **Recomendación:** hacerlo en este PR. Si quieren mantener "nunca aborta" a propósito, que quede escrito en la
  spec como decisión y que el fallback de FK no grabe `NULL`, para no mezclar usuarios con "sistema".

### 2. Los tests de privilegios y de estructura verifican de más en unos lugares y de menos en otros
- **Problema.**
  - **Privilegios.** `registro_operacion.test.sql` comprueba cada privilegio dos veces: con `has_table_privilege`
    (3 `ok` largos) y otra vez con `throws_ok` por rol. Aun así no cubre el contrato completo. Solo mira que no haya
    INSERT, UPDATE, DELETE ni TRUNCATE. Un `grant` futuro de `REFERENCES` o `TRIGGER`, o de `SELECT` a
    `service_role`, pasaría sin que nadie lo note.
  - **Estructura.** Los 9 `has_column` y 3 `col_type_is` repiten el DDL de la migración. Si falta una columna,
    `auditar.test.sql` ya falla, porque hace `select` de todas.
- **Alternativa.**
  - Para los privilegios, usar `table_privs_are` de pgTAP, que compara el conjunto exacto:
    ```sql
    select table_privs_are('public', 'registro_operacion', 'anon',          array[]::text[]);
    select table_privs_are('public', 'registro_operacion', 'service_role',  array[]::text[]);
    select table_privs_are('public', 'registro_operacion', 'authenticated', array['SELECT']);
    ```
    De los `throws_ok` alcanza con uno o dos, como prueba de comportamiento (por ejemplo, "ni el admin puede
    UPDATE").
  - De la estructura, dejar lo que es contrato: los dos `col_is_null`, `fk_ok` y RLS habilitado.
- **Qué se gana.** El archivo baja de 31 a unas 12 aserciones. El contrato pasa de "no tiene estos 4 privilegios" a
  "tiene exactamente estos", que es lo que dice el criterio 6. Y cuando cambie el esquema hay que tocar menos líneas.
- **Severidad:** baja-media.
- **Recomendación:** hacerlo en este PR. Es reemplazar líneas, no hay lógica nueva.

### Nota menor (no es un punto)
- `grant execute on function public.es_admin() to anon, authenticated` sobra. `PUBLIC` ya tiene `EXECUTE` por
  defecto, y Supabase lo vuelve a dar con sus default privileges. Se puede borrar o dejar como documentación.

## Respuesta (código, Fase B)

1. **Acepto.** El "nunca aborta" que traga errores salió de mis instrucciones al implementador, no de la spec.
   `auditar()` pasa a fallar cerrada: sin bloques `exception`. El test del `sub` inexistente espera `23503`.
   Criterio 7 reescrito en la spec (v3). Resuelve también el I1 de `revision.md`.
2. **Acepto.** `table_privs_are` con los conjuntos exactos (anon y service_role vacíos, authenticated `{SELECT}`),
   uno o dos `throws_ok` de comportamiento, y de la estructura solo `col_is_null`, `fk_ok` y RLS.
- **Nota menor:** se deja el `grant execute` de `es_admin()` como documentación explícita de quién la usa.
- **Proceso:** esta sección se agregó con heredoc de bash; los hooks no la vieron. Queda anotado para la próxima ronda.
