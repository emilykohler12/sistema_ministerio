# supabase-base: infraestructura de Supabase local

- **Estado:** aprobada (v3: criterio 7 con falla cerrada y guardias globales, tras la crítica de código de la Fase B)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-08

## Objetivo
Dejar una base Supabase local, reproducible y descartable dentro del Dev Container (0011), con las piezas transversales
que necesitan todos los dominios (helpers, auditoría, tests de RLS y tipos generados). Así cada dominio se migra
después como un corte vertical (0012). No crea tablas de dominio. Se entrega en **dos PRs**: A (entorno) y B (migración base).

## Criterios de aceptación
**Fase A: entorno**
1. Con el contenedor reconstruido, `npm run db:start` levanta Supabase, `npx supabase status` no lista realtime ni analytics,
   y Studio (54323) y Mailpit (54324) abren desde el host.
2. `POST /auth/v1/signup` devuelve un error porque el registro está deshabilitado.
3. Un agente que intenta `supabase` con `--linked`, `--db-url`, `db push`, `link` o `login`, en cualquier forma de invocación,
   queda bloqueado por `proteger-bash.mjs`.

**Fase B: migración base**

4. `npm run db:reset` aplica las migraciones y siembra `admin@dam.local` y `sin-permiso@dam.local`. Con las credenciales de
   desarrollo, `POST /auth/v1/token?grant_type=password` devuelve 200, y el JWT del admin trae `app_metadata.admin = true`.
5. `es_admin()` da true con `app_metadata.admin = true`. Da false sin la marca, como `anon`, y con `user_metadata.admin = true`
   cuando falta `app_metadata`.
6. Sobre `registro_operacion`, `anon`, `authenticated` y `service_role` no pueden hacer INSERT, UPDATE, DELETE ni TRUNCATE.
   Solo un admin puede hacer SELECT.
7. Con el trigger `auditar()`, una tabla con `id` y otra con PK compuesta registran `auth.uid()`, la operación, la tabla,
   `registro_id` (NULL si no hay `id`) y OLD/NEW completos. Sin sesión, `usuario_id` queda NULL. La forma de la tabla
   (sin `id`) nunca aborta la escritura; si el registro de auditoría no se puede escribir (p. ej. `sub` inexistente en
   `auth.users`), la escritura falla (falla cerrada, §9.1). *(v3, tras la crítica de código de la Fase B)*
8. Un test falla si alguna tabla de `public` tiene RLS desactivado.
9. `npm run test:db` pasa los puntos 5 a 8 sin depender del seed: el JWT se simula con `request.jwt.claims`.
10. `npm run db:types` regenera `src/shared/types/database.ts`, y `typecheck`, `lint` y `npm test` pasan.

## Diseño
- **Fase A**
  - `.devcontainer/devcontainer.json`: feature `docker-in-docker`, que ya trae el volumen y `privileged`. Puertos 54321, 54323 y 54324.
  - `package.json`: devDependency `supabase`. Scripts `db:start`, `db:stop`, `db:reset` (reset + seed de usuarios),
    `db:types` y `test:db`, todos locales.
  - `supabase/config.toml`: `enable_signup = false`, realtime y analytics apagados.
  - `.gitignore`: `.env.*` salvo `!.env.example`, `supabase/.temp`, `supabase/.branches` y `supabase/functions/.env`.
  - Hooks:
    - `proteger-bash.mjs`: bloquea el acceso remoto (criterio 3).
    - `limitar-bash.mjs` (perfil `checks`): agrega solo `^npm run (db:reset|test:db)$`.
    - `limitar-escritura.mjs` (perfil `tests`): agrega `supabase/tests/*.sql`.
    - `proteger.mjs`: exceptúa `.env.example` y bloquea Edit/Write sobre `database.ts`.
  - Skill `supabase-rls`:
    - completar los comandos y sacar la nota de "pendiente";
    - documentar que `es_admin()` lee `app_metadata`;
    - documentar que `TRUNCATE` no se audita y que cada corte hace `revoke truncate` a anon y authenticated;
    - documentar que `config.toml` no se aplica a la nube (el registro se deshabilita en el dashboard).
- **Fase B**
  - `supabase/migrations/<ts>_base.sql`:
    - `unaccent` y `inmutable_unaccent()`;
    - `es_admin()`, que lee `auth.jwt() -> 'app_metadata' ->> 'admin'`;
    - `registro_operacion` con `usuario_id` y `registro_id` nullable; FK a `auth.users` sin `set null` (0005: se banea, no se borra);
    - `revoke all` a anon, authenticated y service_role, más `grant select` a authenticated con la política `es_admin()`;
    - `auditar()`: SECURITY DEFINER, `search_path = ''`, `registro_id = to_jsonb(coalesce(NEW, OLD)) ->> 'id'`, `revoke execute`.
  - `scripts/seed-usuarios.mjs`: `auth.admin.createUser` con la clave de servicio **local**. Lo corre `db:reset`.
  - `supabase/tests/base.test.sql`: pgTAP, con tablas temporales de prueba dentro del test.
  - `src/shared/types/database.ts`: generado y excluido de oxlint.
  - Definición §8.3: `usuario_id` y `registro_id` nullable.
- **Decisiones**
  - de la entrevista: NULL = sistema; `es_admin()` lee el JWT; buckets por dominio; realtime y analytics apagados;
  - de la crítica: OLD/NEW completos en lugar de diff; seed con la API de Auth; `supabase.ts` pasa al primer corte.

## Fuera de alcance
- Tablas de dominio, buckets de Storage y la lista de tablas auditadas (cada corte).
- `src/shared/lib/supabase.ts`, `vite-env.d.ts`, `.env.example` y supabase-js (primer corte de dominio).
- Migrar hooks, `AuthContext` y el login real. Edge Functions. Proyecto en la nube, CI con base de datos y MCP.

## Verificación de punta a punta
1. **A:** reconstruir el contenedor → `npm run db:start` → abrir Studio y Mailpit → `curl` a signup (error).
2. **B:** `npm run db:reset && npm run test:db` → verde. `curl` a `/auth/v1/token` con el admin → 200.
3. **B:** `npm run db:types && npm run typecheck && npm run lint && npm test` → verde.
