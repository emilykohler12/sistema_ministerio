# Revisión: supabase-base, Fase B (migración base)

- **Rama:** `chore/supabase-base` (working tree sin commitear)
- **Fecha:** 2026-10-10
- **Alcance:** criterios 4 a 10 y el bullet "Diseño: Fase B" de `spec.md`. La Fase A se revisó en `revision-fase-a.md`.
- **Archivos:** `supabase/migrations/20261010003733_base.sql`, `supabase/tests/*.test.sql`, `scripts/seed-usuarios.mjs`,
  `src/shared/types/database.ts`, `package.json`, `supabase/config.toml`, `docs/definicion-dam.md`,
  `.devcontainer/devcontainer-lock.json`.

## Veredicto
**Cambios requeridos (sin bloqueantes).** Los criterios 4 a 10 se cumplen y están verificados contra la base local.
Hay un problema importante: el respaldo del trigger ante un `sub` sin fila en `auth.users` registra en silencio una
operación autenticada como "sistema", y ningún test lo cubre (I1). Se arregla con pocas líneas. Lo demás es menor.

## Cumplimiento por criterio

| Criterio | Estado | Evidencia |
|---|---|---|
| 4. `db:reset` siembra admin y sin-permiso; login 200; JWT del admin con `app_metadata.admin = true` | Cumple | Reset + seed: "creado" x2; `/auth/v1/token` → 200 para ambos; JWT admin `{"admin":true,...}`, sin-permiso sin la marca. Seed idempotente ("ya existía") |
| 5. `es_admin()`: true con la marca; false sin ella, como anon y con solo `user_metadata.admin` | Cumple, con test | `es_admin.test.sql` (7 asserts). Además: `PUT /auth/v1/user` no puede escribir `app_metadata` (403) y el RPC da `false` |
| 6. `registro_operacion`: nadie de la API escribe ni trunca; SELECT solo admin | Cumple, con test | Privilegios reales: solo `authenticated` tiene SELECT; RLS deja 0 filas al no admin; anon por REST → 42501. Test con `has_table_privilege` + `throws_ok` |
| 7. `auditar()` con `id` y con PK compuesta: uid, operación, tabla, `registro_id`, OLD/NEW; NULL sin sesión; nunca aborta | Cumple, con test parcial | `auditar.test.sql` (17 asserts). La rama de respaldo por FK no está verificada (I1) |
| 8. Test que falla si una tabla de `public` no tiene RLS | Cumple, con test | `rls_global.test.sql` con autoverificación (crea `zz_sin_rls` y comprueba que el guardia la detecta) |
| 9. `test:db` pasa 5 a 8 sin depender del seed | Cumple | Los tests no usan los usuarios sembrados: simulan el JWT con `request.jwt.claims` y `auditar` inserta su propio usuario en `auth.users` dentro de la transacción |
| 10. `db:types` regenera; typecheck, lint y tests pasan | Cumple | `gen types --local` a un archivo temporal = `database.ts` (diff vacío). `db:types` no trunca si falla (`> .tmp && mv`), pero deja el `.tmp` (M5) |

| Diseño Fase B | Estado |
|---|---|
| `unaccent` + `inmutable_unaccent()` | OK: IMMUTABLE, `search_path = ''`, funciona como anon y sirve en un índice (probado). Sin test pgTAP (M3) |
| `es_admin()` lee `app_metadata` | OK (`base.sql:31`), `search_path = ''`, no es SECURITY DEFINER (no lo necesita) |
| `registro_operacion` nullable, FK sin `set null` | OK (`base.sql:42-51`) |
| `revoke all` a anon/authenticated/service_role + `grant select` + política `es_admin()` | OK (`base.sql:58-65`). La secuencia de identidad conserva grants (M1) |
| `auditar()` SECURITY DEFINER, `search_path = ''`, `registro_id` vía `to_jsonb`, `revoke execute` | OK. `service_role` conserva EXECUTE (M2) |
| `scripts/seed-usuarios.mjs` con Admin API y clave local | OK: lee `supabase status`, aborta si la URL no es local (chequeo mejorable, M4). Solo credenciales de demo, documentadas |
| Tests pgTAP con tablas temporales | OK: todo en `begin … rollback` |
| `database.ts` generado y excluido de oxlint | OK (`.oxlintrc.json` `ignorePatterns`; `proteger.mjs` bloquea editarlo) |
| Definición §8.3 nullable | OK en la tabla; tipos y diagrama ER quedan desalineados (M6) |

### Desvío `[auth.email] enable_signup = true`
**Correcto.** En el CLI, `[auth.email] enable_signup` se traduce a `GOTRUE_EXTERNAL_EMAIL_ENABLED` (habilita el proveedor
de email/contraseña, incluido el login), y `[auth] enable_signup = false` a `GOTRUE_DISABLE_SIGNUP` (bloquea todo registro
público). Verificado con la configuración actual: `signup` → 422 `signup_disabled`; `otp` y `magiclink` con
`create_user` → 422 `signup_disabled`; signup anónimo → 422 `anonymous_provider_disabled`. `auth.users` solo tiene los dos
usuarios sembrados. El comentario de `config.toml:223-224` explica el porqué. El criterio 2 de la Fase A sigue en pie.

### `.devcontainer/devcontainer-lock.json`
**Cambio legítimo, no es ruido.** Es la entrada que el CLI de devcontainers fija al reconstruir con la feature
`docker-in-docker:2`, que se agregó a `devcontainer.json` en la Fase A (`e18668b`). Pinea el digest (2.17.0). Conviene
commitearlo, idealmente como `chore` aparte porque pertenece a la Fase A.

## Problemas

### Bloqueante
Ninguno.

### Importante

- **I1** `supabase/migrations/20261010003733_base.sql:87-94` y `supabase/tests/auditar.test.sql:92-103`: si el `sub`
  del JWT no tiene fila en `auth.users`, el respaldo reintenta con `usuario_id = NULL` **sin `raise warning`**. Una
  operación autenticada queda registrada igual que una del sistema, sin rastro. Esto contradice la semántica
  "NULL = sistema (sin sesión)" de §8.3 y el propio comentario de `base.sql:40-41` ("así no se confunde un usuario borrado
  con sistema"). El caso es real: un JWT sigue valiendo hasta una hora después de borrar al usuario. Lo comprobé: con
  `sub` inexistente se escribe la fila con `usuario_id` NULL y no sale ningún WARNING. Con `sub` que no es uuid, en
  cambio, se pierde la fila de auditoría y sí sale un WARNING. Además, el test del caso "nunca aborta" solo hace
  `lives_ok` y cuenta la fila de `zz_prueba_id`. No verifica qué quedó en `registro_operacion`, así que la rama de
  respaldo no está probada (pasaría igual si cayera en `when others` y no auditara nada).
  **Arreglo:** agregar `raise warning 'auditar(): sub % sin fila en auth.users; se registra como sistema', auth.uid()`
  en la rama `foreign_key_violation`. Documentar en §8.3 que NULL también cubre "sesión cuyo usuario ya no existe".
  En el test, agregar un `results_eq` sobre `registro_operacion` para `registro_id = '200'` que espere `usuario_id`
  NULL, INSERT y UPDATE.

### Menor

- **M1** `supabase/migrations/20261010003733_base.sql:58`: la secuencia `registro_operacion_id_seq` conserva USAGE y
  UPDATE para anon, authenticated y service_role (son los privilegios por defecto de Supabase). Hoy no se puede explotar
  por PostgREST (`nextval`/`setval` no están expuestos), pero contradice el "append-only, sin privilegios". **Arreglo:**
  `revoke all on sequence public.registro_operacion_id_seq from anon, authenticated, service_role;` (en una migración
  nueva si esta ya se commiteó).
- **M2** `supabase/migrations/20261010003733_base.sql:108`: `service_role` conserva EXECUTE sobre `auditar()` (verificado
  con `has_function_privilege`). No escala sin DDL, pero es incoherente con el criterio 6, que también excluye a
  service_role. **Arreglo:** sumar `service_role` al `revoke execute` y un `function_privs_are` para service_role en
  `auditar.test.sql`.
- **M3** Huecos en los tests pgTAP:
  - `registro_operacion.test.sql` no comprueba que service_role no tenga SELECT ("solo un admin puede hacer SELECT").
  - No se verifica `search_path = ''` (`proconfig`) en `es_admin`, `auditar` ni `inmutable_unaccent`.
  - `inmutable_unaccent()` no tiene ningún test (que quite tildes y que sea IMMUTABLE).

  **Arreglo:** un `ok(not has_table_privilege('service_role', ..., 'SELECT'))`, un assert sobre
  `pg_proc.proconfig` por función y un `is(public.inmutable_unaccent('Árbol ñandú'), 'Arbol nandu')` + `volatility_is`.
- **M4** `scripts/seed-usuarios.mjs:53`: la defensa "solo local" compara por prefijo, así que también deja pasar
  `http://localhost.ejemplo.com` o `http://127.0.0.1.nip.io`. El origen es `supabase status` local y el riesgo es bajo,
  pero el chequeo no hace lo que dice. **Arreglo:**
  `['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)`.
- **M5** `package.json:17`: si `gen types` falla, `database.ts` queda intacto (bien), pero queda
  `src/shared/types/database.ts.tmp`, que `.gitignore` no cubre y se puede commitear por error. **Arreglo:** agregar
  `src/shared/types/*.tmp` a `.gitignore`, o terminar el script con `|| (rm -f src/shared/types/database.ts.tmp; exit 1)`.
- **M6** `docs/definicion-dam.md:388-390` (diagrama ER) y `:535-536` (§8.3): siguen con `varchar operacion`,
  `varchar tabla` y `varchar registro_id`, pero la migración usa `text` (con CHECK en `operacion`). **Arreglo:**
  alinear el diagrama y la tabla con `text`.

## Evidencia

```
$ npm run db:reset
Applying migration 20261010003733_base.sql...
Finished supabase db reset on branch chore/supabase-base.
admin@dam.local: creado
sin-permiso@dam.local: creado

$ node scripts/seed-usuarios.mjs          # idempotencia
admin@dam.local: ya existía
sin-permiso@dam.local: ya existía

$ npm run test:db
supabase/tests/auditar.test.sql ............. ok
supabase/tests/es_admin.test.sql ............ ok
supabase/tests/registro_operacion.test.sql .. ok
supabase/tests/rls_global.test.sql .......... ok
All tests successful.
Files=4, Tests=57
Result: PASS

$ curl POST /auth/v1/token?grant_type=password
admin@dam.local -> 200   app_metadata {"admin":true,"provider":"email","providers":["email"]}
sin-permiso@dam.local -> 200   app_metadata {"provider":"email","providers":["email"]}
$ curl POST /auth/v1/signup            -> 422 signup_disabled
$ curl POST /auth/v1/otp (create_user) -> 422 signup_disabled
$ curl POST /auth/v1/magiclink         -> 422 signup_disabled
$ curl POST /auth/v1/signup {}         -> 422 anonymous_provider_disabled
$ PUT /auth/v1/user {app_metadata:{admin:true}} (sin-permiso) -> 403; nuevo JWT sin la marca; rpc/es_admin -> false
$ GET /rest/v1/registro_operacion (sin-permiso) -> 200 []
$ GET /rest/v1/registro_operacion (anon)        -> 401 42501 permission denied

Privilegios reales (psql):
  tabla registro_operacion: solo authenticated|SELECT
  secuencia registro_operacion_id_seq: anon/authenticated/service_role USAGE+UPDATE   (M1)
  EXECUTE auditar(): anon f, authenticated f, service_role t                          (M2)
  proconfig: es_admin, auditar, inmutable_unaccent -> search_path=""

Probe de auditar() (transacción con rollback):
  sub inexistente -> fila con usuario_id NULL, sin WARNING                            (I1)
  sub no uuid     -> WARNING "invalid input syntax for type uuid", escritura completa, sin fila de auditoría

$ npx supabase gen types typescript --local > scratchpad/db.ts && diff scratchpad/db.ts src/shared/types/database.ts
(sin diferencias)

$ npm run lint
exit 0 · 4 warnings preexistentes (react/incompatible-library x3, react/only-export-components en AuthContext), 0 errores
$ npm run typecheck
tsc -b · exit 0
$ npm test
Test Files  4 passed (4) · Tests  48 passed (48)
```

## Segunda revisión

- **Fecha:** 2026-10-10
- **Código revisado:** `git diff 71f2137..HEAD` (commit `2edf66c`, working tree limpio), contra `spec.md` v3 (criterios 4 a 10;
  el 7 ahora es "falla cerrada").

### Veredicto
**Aprobado.** El I1 y los seis menores están resueltos y cada uno tiene su test. Los criterios 4 a 10 se cumplen contra la
base local. No hay bloqueantes ni importantes nuevos. Quedan tres menores: dos de documentación y uno de cobertura.

### Estado de los problemas anteriores

| Id | Estado | Cómo se resolvió |
|---|---|---|
| I1 | Resuelto (por cambio de spec) | El criterio 7 v3 pasa a falla cerrada: se quitó el `exception when ...` de `auditar()` (`base.sql:82-95`). Con `sub` inexistente, la FK aborta la escritura (23503). `auditar.test.sql:94-102` lo cubre con `throws_ok` para INSERT y UPDATE. No es un falso verde: el UPDATE apunta a la fila 100, que existe; si no disparara el trigger, `throws_ok` fallaría. También probé que un `sub` que no es uuid aborta (22P02) y que DELETE con `sub` inexistente aborta (23503) |
| M1 | Resuelto | `base.sql:68` revoca la secuencia a anon, authenticated y service_role. ACL real: `{postgres=rwU/postgres}`. Tiene tres `sequence_privs_are` (`registro_operacion.test.sql:25-30`) |
| M2 | Resuelto | `base.sql:99` también revoca a `public` y `service_role`. ACL real: `{postgres=X/postgres}`. Test en `auditar.test.sql:15` |
| M3 | Resuelto | `table_privs_are` exacto para service_role (`registro_operacion.test.sql:19`). `funciones.test.sql` verifica `proconfig`, `volatility_is` y que `inmutable_unaccent('Educación Física')` dé `'Educacion Fisica'` |
| M4 | Resuelto | `seed-usuarios.mjs:32-39` compara protocolo `http:` y hostname exacto (`127.0.0.1` / `localhost`). `localhost.evil.com` y `localhost.` quedan rechazados |
| M5 | Resuelto | `.gitignore:10` `src/shared/types/*.tmp` (`git check-ignore` confirma) |
| M6 | Resuelto | Diagrama ER y §8.3 usan `text`, documentan los NULL y la falla cerrada (`definicion-dam.md:388-390`, `:534-541`) |

### Seguridad: privilegios de funciones
- `es_admin()`: EXECUTE para PUBLIC, anon, authenticated y service_role. Los da el default privilege de Supabase; el `grant`
  de `base.sql:34` es redundante. **Está bien:** no es SECURITY DEFINER, solo lee el JWT de quien la llama y las políticas RLS
  la necesitan ejecutable para authenticated (y para anon, en las políticas futuras).
- `inmutable_unaccent(text)`: EXECUTE para todos y expuesta como RPC (`POST /rest/v1/rpc/inmutable_unaccent` como anon → 200).
  **Está bien:** es pura, no es SECURITY DEFINER y no lee datos.
- `auditar()`: SECURITY DEFINER, dueño `postgres`, `search_path = ''`, nombres calificados (`auth.uid()`,
  `public.registro_operacion`). Solo `postgres` tiene EXECUTE. Probé que `authenticated` no puede crear un trigger con ella
  (`permission denied for function public.auditar`), así que no se pueden fabricar filas de auditoría desde la API.
  anon y authenticated tampoco tienen CREATE en `public`.
- Ojo para los cortes de dominio: los default privileges de `public` dan `arwdDxtm` sobre tablas y `rwU` sobre secuencias a
  anon, authenticated y service_role. Cada tabla nueva nace con todos los privilegios y solo la RLS la protege. El skill
  menciona solo `revoke truncate`. No afecta a esta fase, que no tiene tablas de dominio.

### Problemas nuevos

**Bloqueante:** ninguno. **Importante:** ninguno.

**Menor**
- **N1** `docs/definicion-dam.md:556` (§8.4): dice que el trigger guarda "el diff", pero la decisión (spec, "de la crítica")
  y la migración guardan OLD/NEW completos. El texto viene de v2 (`6806aff`), pero ahora contradice §8.3.
  **Arreglo:** "guarda `auth.uid()`, la operación y el estado anterior y posterior completos (OLD/NEW)".
- **N2** `docs/specs/supabase-base/spec.md:3`: el estado sigue en "aprobada (v2, después de la crítica)", pero el criterio 7
  ya es v3. **Arreglo:** "aprobada (v3, falla cerrada en `auditar()` tras la crítica de código de la Fase B)".
- **N3** `supabase/tests/auditar.test.sql:94-102`: la falla cerrada se prueba con INSERT y UPDATE, pero no con DELETE ni con
  un `sub` que no es uuid. Hoy funciona (lo verifiqué a mano), pero el contrato "la escritura falla" quedaría sin cubrir si
  alguien vuelve a envolver el insert en un `exception`. **Arreglo (opcional):** un `throws_ok` de DELETE con el `sub`
  inexistente y otro con `sub` `"no-uuid"` que espere `22P02`.

### Evidencia

```
$ npm run db:reset
Applying migration 20261010003733_base.sql...
Finished supabase db reset on branch chore/supabase-base.
admin@dam.local: creado
sin-permiso@dam.local: creado

$ npm run test:db
auditar.test.sql ............. ok
es_admin.test.sql ............ ok
funciones.test.sql ........... ok
registro_operacion.test.sql .. ok
rls_global.test.sql .......... ok
All tests successful.
Files=5, Tests=49
Result: PASS

$ curl POST /auth/v1/token?grant_type=password
admin@dam.local -> 200 {"admin":true,"provider":"email","providers":["email"]}
sin-permiso@dam.local -> 200 {"provider":"email","providers":["email"]}
$ curl POST /auth/v1/signup -> 422 signup_disabled

Privilegios reales (psql):
  EXECUTE   auditar(): anon f · authenticated f · service_role f   acl {postgres=X/postgres}
  EXECUTE   es_admin(), inmutable_unaccent(text): anon t · authenticated t · service_role t (PUBLIC incluido)
  tabla     registro_operacion: {postgres=arwdDxtm/postgres, authenticated=r/postgres}
  secuencia registro_operacion_id_seq: {postgres=rwU/postgres}
  schema public CREATE: anon f · authenticated f · service_role f
  proconfig de las 3 funciones: search_path=""

Probe de falla cerrada (transacción con rollback):
  sub "no-uuid", INSERT              -> ERROR 22P02 invalid input syntax for type uuid (escritura abortada)
  sub inexistente, DELETE            -> ERROR 23503 registro_operacion_usuario_id_fkey (escritura abortada)
  authenticated CREATE TRIGGER ... auditar() -> ERROR permission denied for function public.auditar

$ npx supabase gen types typescript --local > scratchpad/db.ts && diff scratchpad/db.ts src/shared/types/database.ts
(sin diferencias)

$ npm run lint
exit 0 · 4 warnings preexistentes (react/incompatible-library x3, react/only-export-components), 0 errores
$ npm run typecheck
tsc -b · exit 0
$ npm test
Test Files  4 passed (4) · Tests  48 passed (48)
```
