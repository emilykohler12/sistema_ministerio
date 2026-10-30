# Límite de frecuencia de las descargas (#26)

- **Estado:** aprobada (crítica respondida en `critica.md`; decisiones delegadas por el usuario)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-29

## Objetivo
Cualquiera puede llamar a `registrar_descarga` en bucle e inflar las métricas del Ministerio. Según 0030, la RPC deja de **contar** las descargas de
una IP que pasa un tope en una ventana de tiempo. No rechaza ni toca la firma de enlaces: se protegen las métricas, no el acceso (0022).

## Criterios de aceptación
1. **Tope silencioso.** Dada una IP con 30 intentos en los últimos 10 minutos, cuando llama otra vez a `registrar_descarga` (anon o authenticated sin
   admin) con datos válidos, la RPC responde bien y **no** inserta en `registro_descarga` ni en `intento_descarga`. Un intento sembrado con
   `fecha_hora` justo fuera de la ventana no cuenta.
2. **Qué cuenta.** Solo las llamadas que insertan: no cuentan las rechazadas (`DA003`, `DA004`, CHECK; el intento se revierte con la transacción),
   las que ya pasaron el tope ni las del admin (#25). `DA003`/`DA004` se siguen evaluando antes que el tope.
3. **IP.** Se toma solo `x-real-ip` de `request.headers` (`nullif(current_setting(...), '')`). Sin encabezado, con `''` o sin HTTP, no se aplica el
   tope y se registra. Un `X-Forwarded-For` falso no cambia nada.
4. **Datos mínimos.** Se guarda `sha256` de la IP, nunca la IP. Cada llamada no admin borra **todos** los intentos más viejos que la ventana, de
   cualquier IP: un intento vive hasta la siguiente llamada después de vencer.
5. **Concurrencia.** Lock transaccional por hash antes de contar (se verifica en la revisión; pgTAP no puede probar dos sesiones).
6. **Acceso.** `anon` y `authenticated` (también el admin) no leen ni escriben `intento_descarga` y no ejecutan `ip_cliente()` (42501).
   `intento_descarga` no se audita (excepción en `auditoria_global`). Las guardias globales siguen en verde.
7. **Sin cambios visibles.** El modal, el hook y `errores.ts` no cambian; los tests existentes de `src/features/descargas/` pasan sin tocarlos.

## Diseño
- `supabase/migrations/<ts>_limite_descargas.sql`:
  - `intento_descarga (id bigint identity, ip_hash bytea not null, fecha_hora timestamptz not null default now())`, índice `(ip_hash, fecha_hora)`,
    RLS sin políticas, `revoke all` de tabla y secuencia a `anon` y `authenticated`. Sin `updated_at` ni `auditar()`.
  - `ip_cliente() returns text` (invoker, `stable`, `search_path = ''`, `revoke execute` de `public`, `anon`, `authenticated` y `service_role`).
  - `create or replace registrar_descarga` con la **misma firma** y repitiendo `security definer` y `set search_path = ''`. Tras `if es_admin() then return`:
    si hay IP → `pg_advisory_xact_lock(hashtextextended(ip, 0))`, `delete ... where fecha_hora < now() - c_ventana`, contar los del hash, si llega a
    `c_tope = 30` → `return`; si no, insertar el intento y después el registro (`c_ventana = '10 minutes'`).
- `supabase/tests/limite_descargas.test.sql` (pgTAP; `set_config('request.headers', ..., true)` en cada caso) y `auditoria_global.test.sql`
  (`('intento_descarga', 28)` con justificación).
- `npm run db:types`; `src/features/historial/entidades.ts`: excluir `intento_descarga` del `Record` (nunca aparece en el historial).
- `e2e/global-setup.ts` + `globalSetup` en `playwright.config.ts`: vacía `intento_descarga` con `supabaseLocal()` (clave de servicio, solo local).
- Docs: `arquitectura.md`, `definicion-dam.md` §623 y §666, 0030 corregida (no cuenta en lugar de `DA006`).

**Decisiones (delegadas):** 30 cada 10 min, ventana deslizante (con la marca de visita, 30 registros desde una IP en 10 min es una sala de
profesores entera; corta un bucle, no un atacante con muchas IP). Fail-open sin IP. Hash sin sal: seudonimización; lo que protege es la retención.
Purga en la RPC, sin `pg_cron`. Tabla en `public` para que la cubran las guardias.

## Fuera de alcance
- Tope de `expiresIn`, revocar enlaces, captcha, Edge Function (0030). Límite de `contar_descarga_normativa` (issue aparte).
- Mostrar en el dashboard cuántas descargas no se contaron; tope configurable.

## Verificación de punta a punta
1. `npm run db:reset && npm run test:db`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run test:e2e` en verde.
2. Local, como anon por API: 35 llamadas válidas → `registro_descarga` suma 30, todas responden 204. Con `X-Forwarded-For` falso, igual.
   `intento_descarga` tiene hashes de 32 bytes, nunca la IP.
3. Como admin, ninguna llamada inserta (como hoy). El modal sigue funcionando tras pasar el tope.
4. **Bloqueante para desplegar la migración (manual, una persona, no agentes):** en el proyecto alojado, crear una función temporal que devuelva
   `request.headers`, llamarla desde dos redes distintas (con y sin `X-Real-IP` falso) y confirmar que `x-real-ip` trae la IP de cada cliente y no
   la de un proxy. Anotarlo en `contexto.md` y borrar la función. Si no, cambiar solo `ip_cliente()`.
