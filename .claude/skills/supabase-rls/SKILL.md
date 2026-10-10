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
- Guardias globales (fallan solas si un corte se olvida algo): RLS activado (`rls_global`), trigger `auditar()`
  en toda tabla de `public` salvo las excepciones listadas (`auditoria_global`) y sin TRUNCATE para anon ni
  authenticated (`truncate_global`).

## Auditoría y privilegios
- `registro_operacion` es append-only: solo escribe el trigger `auditar()` (SECURITY DEFINER, `search_path = ''`).
- `auditar()` falla cerrada: si no puede registrar, la escritura falla.
- Cada tabla nueva lleva `create trigger <tabla>_auditar after insert or update or delete on <tabla>
  for each row execute function public.auditar()`. Si una tabla no debe auditarse, agregala a la lista
  de excepciones de `auditoria_global.test.sql` con su justificación.
- `TRUNCATE` no se audita (los triggers de fila no se disparan). La migración de guardias le quita TRUNCATE a
  anon y authenticated por privilegios por defecto; no hace falta repetirlo por tabla.
- Supabase da a anon y authenticated los demás privilegios sobre cada tabla nueva: la RLS es la única barrera.

## Storage
- El bucket se crea **en la migración** (`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)`),
  no en `config.toml`, que solo aplica a la base local. El bucket es la autoridad de tamaño y formato: rechaza con 413/415.
- Las políticas van sobre `storage.objects`, con `bucket_id = '<bucket>'` y `(select public.es_admin())`. `upload` con `upsert: false` solo
  necesita insert; `remove()` y `createSignedUrl()` necesitan select; sin update si nunca se hace `upsert`. Sin políticas para `anon`
  (un bucket privado no se lee por URL pública).
- **No se borra por SQL**: el trigger `protect_delete` de `storage.objects` lo bloquea. En un test, `set local storage.allow_delete_query = 'true'`
  (storage-api lo fija en cada request). Un DELETE con WHERE también necesita que la política de **select** deje ver la fila: sin el select
  abierto, la política de delete no se prueba sola (el test crea un select temporal y lo borra).
- `remove()` devuelve `data: []` sin error si no borró nada (la RLS lo oculta o no existe): tratarlo como falla.
- En storage-js el error trae `status` = HTTP (400) y `statusCode` = código real (`'413'`, `'415'`, `'404'`): mirar los dos.
- Un trigger `BEFORE` corre antes que la RLS: si lee `storage.objects`, `anon` recibe el error del trigger en lugar de `42501` y no distingue "no
  existe" de "no lo veo". No validar contra `storage.objects` desde la base; sostener el invariante con el orden de las operaciones.

## Nube
- `supabase/config.toml` solo aplica a la base local. En el proyecto de demos hay que deshabilitar el registro
  de usuarios en el dashboard (Authentication > Sign In / Providers).

## Errores a evitar
- Tabla sin RLS: queda abierta para `anon`.
- Política `using (true)` en escritura.
- Leer `user_metadata` para decidir permisos.
- Usar la service role key en el frontend.
- Editar una migración ya commiteada en lugar de crear una nueva.
