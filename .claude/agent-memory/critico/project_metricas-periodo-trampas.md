---
name: metricas-periodo-trampas
description: Trampas vistas en la spec dashboard (2026-10-16): filtro de período repetido por RPC, zona horaria (date_trunc con TZ de sesión UTC), "hoy" en UTC del cliente, cobertura con filtro PADRON vs vinculación, sin vincular sin localidad, verificación que choca con visita.ts
metadata:
  type: project
---

En la crítica de la spec `dashboard` (2026-10-16), donde aparecen las primeras RPC de lectura agregada (6 `metricas_*` invoker):
- **Filtro de período copiado en N RPC:** propuse una auxiliar `metricas_registros(desde, hasta)` (invoker, EXECUTE authenticated
  por el chequeo anidado) con `42501`, `22023`, el rango sargable `>= desde::timestamp at time zone 'America/Argentina/Buenos_Aires'`
  y `< (hasta+1)::timestamp at time zone ...`, más una columna `dia` local. Así los bordes se prueban una sola vez.
- **`date_trunc('month', timestamptz)` usa la TimeZone de la sesión (UTC en Supabase):** hay que truncar la fecha ya convertida.
- **"Hoy" en el cliente con `toISOString()` es UTC:** después de las 21:00 en Argentina ya es mañana. Hay que usar `Intl` con `timeZone`.
- **Tests de bordes que solo prueban inclusiones** no distinguen un rango que se pasa por un día: hay que pedir también las exclusiones.
- **Cobertura con `institucion_tipo = 'PADRON'`** ignora para siempre a las OTRA vinculadas (0010). Un alcanzado = `establecimiento_id`
  no nulo, atribuido por `establecimiento.localidad_id`, igual que el denominador.
- **Sin vincular** agrupa por `(localidad_id, nombre normalizado)`: el nombre es único por localidad, no global.
- **Porcentajes y cobertura en SQL** chocan con los `RETURNS TABLE` que se tipan no nulos. Mejor que la RPC devuelva conteos y que
  el cliente calcule con funciones puras.
- Las verificaciones de punta a punta que hacen "N descargas" en la misma pestaña chocan con `visita.ts` (un registro por taller y
  por visita).
- 6 RPC `returns table` > 1 jsonb (tipo `Json`, migraciones inmutables) > vistas (sin parámetros, distintos por período). No reabrir.

Crítica del código (2026-10-16), todo bajo. Lo que vale para próximos cortes:
- **`perform 1 from <srf plpgsql>(...) limit 1`** para forzar la validación: el `limit` no corta, porque `return query`
  materializa todo, así que el recorrido es doble. Es correcto (un CTE o un join vacíos pueden no evaluar la auxiliar), pero lo
  limpio es una `*_validar() returns void` llamada con `perform`. No vale una migración solo para eso.
- **Un test "anon sin EXECUTE" que espera `42501`** no distingue la falta de grant del `es_admin()` interno. El que lo prueba
  es `has_function_privilege`.
- Bucles pgTAP que cuentan aciertos ("got 6, expected 7") no dicen qué falló: mejor acumular las llamadas fallidas.
- `keepPreviousData` sin `isPlaceholderData` muestra números del período anterior bajo el selector nuevo.
- `VARIANTE_ESTADO` (badge de taller) ya está en 2 copias (`TalleresListPage`, `TablaRanking`), y las fechas `AAAA-MM-DD`
  vuelven a formatearse a mano pese a `shared/lib/date.ts`.

**Why:** las métricas por período fallan en silencio (números plausibles, pero corridos un día o mal atribuidos) y nadie las
contrasta a mano.

**How to apply:** en cualquier RPC o pantalla con fechas o rangos, pedir el filtro sargable con zona explícita en un solo lugar y tests
de exclusión. Ver la `## Respuesta` de `docs/specs/dashboard/critica.md` para saber qué se aceptó. Relacionado:
[[postgres-rpc-triggers-trampas]], [[frontend-cortes-patrones]].
