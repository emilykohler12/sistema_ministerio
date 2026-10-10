# 0022 · Descarga de talleres por RPC y política de Storage, sin Edge Function

- **Estado:** aceptada (modifica el mecanismo de 0006 y la mención de `descargar-taller` en 0004)
- **Fecha:** 2026-10

## Contexto
0006 y 0004 asignaban a la Edge Function `descargar-taller` tres tareas: validar el formulario, insertar el `registro_descarga` y firmar los
enlaces del bucket privado con `service_role`. 0006 también acepta que "se protegen las métricas, no el acceso": la función se puede invocar
con datos falsos. Surgió en el corte descargas (`docs/specs/descargas/`).

## Opciones consideradas
- **Edge Function:** tiene `service_role` en un endpoint anónimo y saltea toda la RLS. Sería el primer código Deno del repo, sin cobertura
  de lint, typecheck, Vitest ni de los perfiles de los subagentes, y con un deploy aparte.
- **RPC `registrar_descarga` (definer, `anon`) + política SELECT de `storage.objects` para `anon`, condicionada a `recurso`:**
  - la RPC solo inserta;
  - la política deja firmar solo las rutas que `anon` ya ve por la RLS de `recurso`/`taller`;
  - todo se prueba con pgTAP y Vitest.

## Decisión
RPC + política. La RPC normaliza los campos según su discriminador, valida el taller publicado (`DA003`) y el establecimiento activo de la
localidad (`DA004`). El cliente firma con `createSignedUrl` (1 h). `registro_descarga` no audita el INSERT: la tabla ya es el registro de un
hecho anónimo. `auditoria_global` pasa a exigir INSERT, UPDATE y DELETE, con excepciones por evento.

## Consecuencias
- Pérdidas aceptadas:
  - el cliente elige el `expiresIn`;
  - despublicar no revoca los enlaces ya emitidos;
  - el acceso al bucket queda atado a la RLS de `recurso`/`taller` (lo fija un pgTAP);
  - una ruta visible se puede firmar sin el formulario.
- 0004 sigue vigente para `gestionar-usuarios`, que necesita la API de administración de Auth.
- Si aparece abuso, el captcha (Turnstile) obligaría a volver a una Edge Function para verificarlo del lado del servidor.
