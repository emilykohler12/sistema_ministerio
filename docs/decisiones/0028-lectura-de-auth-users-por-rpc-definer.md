# 0028 · Lectura de `auth.users` por RPC definer solo admin

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
El historial (#20) tiene que mostrar quién hizo cada operación, pero `registro_operacion` guarda solo `usuario_id`. `auth.users`
no está expuesta por PostgREST y no hay tabla de perfiles. La gestión de usuarios (#34) va a tener el mismo problema para listarlos.

## Opciones consideradas
- **Vista en `public` sobre `auth.users`:** fácil de consultar, pero el linter de Supabase la marca como exposición de `auth`, y un grant
  mal puesto la deja abierta a `anon`.
- **Tabla de perfiles sincronizada por trigger:** queda una copia que hay que mantener y que se adelanta a #34 sin necesidad.
- **RPC `security definer` solo para el admin:** devuelve solo las columnas necesarias, con el mismo molde que las métricas (0024) y la
  vinculación (0027).

## Decisión
Se lee `auth.users` solo por RPC `security definer` con `search_path` vacío y nombres calificados. La función evalúa `es_admin()`
primero y responde `42501` sin la marca; está en plpgsql porque una `language sql` no puede lanzar el error. Tiene `revoke` de `public`,
`anon` y `service_role`, y EXECUTE solo para `authenticated`. Devuelve solo lo que pide la pantalla (`usuarios_historial`: `id` y
`email::text` de quienes tienen operaciones, baneados incluidos).

## Consecuencias
- El pgTAP fija los privilegios con `has_function_privilege` y el tipo de retorno con `pg_get_function_result`: una columna de más falla.
- #34 lista usuarios con su propia RPC del mismo molde. Las escrituras (invitar, banear) siguen en la Edge Function de 0005.
- No hay nombres de personas hasta que exista un perfil; si se agrega, esta RPC lo une sin cambiar las pantallas.
