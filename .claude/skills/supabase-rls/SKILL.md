---
name: supabase-rls
description: Cómo escribir y testear migraciones y políticas RLS de Supabase en el DAM. Usar al crear tablas, políticas o al revisar seguridad de la base. Pendiente hasta integrar Supabase.
---

> Estado: Supabase aún no está integrado. Al integrarlo, completar los comandos y borrar esta nota.

## Modelo de acceso
| Actor | Rol Postgres | Puede |
|---|---|---|
| Institución (sin login) | `anon` | Leer contenido con estado `publicado`; insertar un registro de descarga |
| Administrador | `authenticated` | Leer y escribir todo el catálogo, normativas y configuración |

## Procedimiento
1. Levantar Supabase local: `npx supabase start`.
2. Crear migración: `npx supabase migration new <nombre>`.
3. En la misma migración: tabla + `alter table ... enable row level security` + políticas.
4. Escribir un test por política (rol `anon` y `authenticated`, caso permitido y denegado).
5. Aplicar: `npx supabase db reset` (solo local, nunca `--linked`).
6. Correr los tests de base.

## Errores a evitar
- Tabla sin RLS: queda abierta para `anon`.
- Política `using (true)` en escritura.
- Usar la service role key en el frontend.
- Editar una migración ya commiteada en lugar de crear una nueva.
