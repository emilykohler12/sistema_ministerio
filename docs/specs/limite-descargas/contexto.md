# Contexto · limite-descargas (#26)

Juntado por `Explore` y completado por el agente principal (puntos marcados **comprobado**). 2026-10-29.

## IP del cliente en Postgres
- PostgREST expone los encabezados en `current_setting('request.headers', true)` (JSON, claves en minúsculas). Sin HTTP (pgTAP) da NULL.
- **Comprobado en el Supabase local** (función temporal por curl, ya borrada):
  - sin encabezados propios: `x-real-ip = 172.19.0.1`, `x-forwarded-for = 172.19.0.1`;
  - mandando `X-Forwarded-For: 6.6.6.6` y `X-Real-IP: 7.7.7.7`: `x-real-ip = 172.19.0.1` (Kong lo pisa) y `x-forwarded-for = 6.6.6.6, 172.19.0.1`
    (Kong agrega la IP real al final). El primer elemento de `x-forwarded-for` es falsificable; `x-real-ip` y el último, no.
- **Sin comprobar:** qué llega en el Supabase alojado (Cloudflare delante del gateway). Se verifica a mano al desplegar (spec, verificación 4).

## `registrar_descarga` hoy
- Vigente en `supabase/migrations/20261016130000_no_contar_admin.sql:10-57` (`create or replace` de `20261010180000_descargas.sql`).
  plpgsql, `security definer`, `search_path = ''`. Orden: normaliza → `DA003` → `DA004` → `if es_admin() then return` → insert.
- Grants en `20261010180000_descargas.sql:120-123` (`revoke ... from public`, `grant ... to anon, authenticated`). `create or replace` con la
  misma firma los conserva: no cambiar la firma.
- Tests: `supabase/tests/descargas.test.sql` (plan 98). Anon: `set local role anon` + claims; admin: `authenticated` + `app_metadata`.
  Ningún test setea `request.headers`; se puede con `set_config('request.headers', '{"x-real-ip":"1.2.3.4"}', true)`.

## Guardias globales (solo schema `public`)
- `rls_global`: RLS habilitado (no exige políticas). `truncate_global`: sin TRUNCATE para anon/authenticated → `revoke all` (y la secuencia).
- `auditoria_global.test.sql:20`: excepciones por evento en un `values` (`('registro_operacion', 28)`, `('registro_descarga', 4)`) con su
  justificación en las líneas 4-6. Una tabla no auditada necesita `(tabla, 28)`.
- `updated_at_global` no aplica sin `updated_at`; `storage_global` no aplica.
- `src/features/historial/entidades.ts` tipa `Record<Exclude<keyof Tables, 'registro_operacion'>, Entidad>`: una tabla nueva en `public`
  rompe el typecheck hasta excluirla o mapearla.

## Frontend
- `errores.ts`: `esTallerNoDisponible` (DA003), `esInstitucionNoDisponible` (DA004), `mensajeDeErrorDescarga` (genérico para el resto).
- `hooks/useRegistrarDescarga.ts:19-33`: marca la visita solo en `onSuccess`; `onError` solo trata DA004.
- `components/DescargaModal.tsx:47,91-93,309`: con error queda en el paso 1, datos cargados, mensaje en `FieldError id="descarga-error"`.
- Tests: `errores.test.ts`, `hooks/useRegistrarDescarga.test.ts`, `components/DescargaModal.test.tsx`.

## Extensiones
- **Comprobado:** `pgcrypto` 1.3 instalado (schema `extensions`); `pg_cron` disponible pero no instalado. Postgres trae `sha256(bytea)` nativo.

## E2E
- Un worker, todos desde la misma IP local. `descargas`, `dashboard`, `sin-vincular` y `no-contar-admin` suman ~10-15 llamadas anónimas
  a `registrar_descarga` por corrida. El admin queda exento.
