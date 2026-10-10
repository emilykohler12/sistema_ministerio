---
name: supabase-rls
description: Cómo escribir y testear migraciones y políticas RLS de Supabase en el DAM. Usar al crear tablas, políticas o al revisar seguridad de la base.
---

## Modelo de acceso
| Actor | Rol Postgres | Puede |
|---|---|---|
| Institución (sin login) | `anon` | Leer contenido con estado `publicado`; insertar un registro de descarga |
| Administrador | `authenticated` con `es_admin()` | Leer y escribir todo el catálogo, normativas y configuración |

`es_admin()` lee `auth.jwt() -> 'app_metadata' ->> 'admin'`. Nunca `user_metadata`: el usuario puede editarlo.

## Comandos (siempre locales; nunca `--linked` ni `--db-url`)
- `npm run db:start` / `npm run db:stop`: levantar y apagar Supabase local (Docker-in-Docker).
- `npm run db:reset`: aplica las migraciones desde cero (y siembra los usuarios de desarrollo).
- `npm run test:db`: corre los tests pgTAP de `supabase/tests/*.sql`.
- `npm run db:types`: regenera `src/shared/types/database.ts` (no se edita a mano).
- `npx supabase migration new <nombre>`: crea una migración.

## Procedimiento
1. Levantar Supabase local: `npm run db:start`.
2. Crear migración: `npx supabase migration new <nombre>`.
3. En la misma migración: tabla + `alter table ... enable row level security` + políticas.
4. Escribir un test pgTAP por política (rol `anon` y `authenticated`, caso permitido y denegado) en `supabase/tests/`.
5. Aplicar: `npm run db:reset`.
6. Correr los tests: `npm run test:db`.
7. Regenerar tipos: `npm run db:types`.

## Tests pgTAP
- No dependen del seed: simular el JWT con `set local role authenticated` y
  `set local request.jwt.claims = '{"app_metadata":{"admin":true}}'`.
- Hay un test que falla si alguna tabla de `public` tiene RLS desactivado.

## Auditoría y privilegios
- `registro_operacion` es append-only: solo escribe el trigger `auditar()` (SECURITY DEFINER, `search_path = ''`).
- `TRUNCATE` no se audita (los triggers de fila no se disparan). Cada corte de dominio hace
  `revoke truncate on <tabla> from anon, authenticated`.

## Nube
- `supabase/config.toml` solo aplica a la base local. En el proyecto de demos hay que deshabilitar el registro
  de usuarios en el dashboard (Authentication > Sign In / Providers).

## Errores a evitar
- Tabla sin RLS: queda abierta para `anon`.
- Política `using (true)` en escritura.
- Leer `user_metadata` para decidir permisos.
- Usar la service role key en el frontend.
- Editar una migración ya commiteada en lugar de crear una nueva.
