---
name: eventos-anonimos-crecimiento
description: Tabla de eventos escrita por una RPC anónima sin tope (spec descargas-normativas-periodo #32, 2026-11-13): crecimiento sin cota vs. contador; propuse agregado por día; grant select olvidado para RPC invoker; tests que fijan "exactamente N" metricas
metadata:
  type: project
---

En la crítica de la spec `descargas-normativas-periodo` (#32, 2026-11-13), la spec agregaba `descarga_normativa` con una fila por llamada a
`contar_descarga_normativa` (anon, sin tope por IP) y decía «mismo nivel que el contador de hoy».
- **No es el mismo nivel:** un contador `int` no crece; una fila por llamada anónima sí, sin cota (estimé ~100 B/fila con índice). Propuse
  `descarga_normativa_dia (normativa_id, dia, descargas)` con PK compuesta y upsert en el mismo CTE del `update`: tamaño acotado, filtro por
  `dia between`, zona horaria solo al escribir, PK = único índice (cascada incluida). Trampa: `sum()` en left join da NULL → `coalesce`.
- **RPC invoker sobre tabla con `revoke all`:** las specs copian el `revoke all` del molde `registro_descarga` y olvidan el
  `grant select ... to authenticated` que le sigue (`descargas.sql`:47-48). El error es 42501, igual que "no admin": pedir test con filas.
- **Si la RPC de métricas ya parte de una tabla para dar ceros, que devuelva la fila completa** y se borre el `select` paralelo y la unión por id.
- Tests que fijan conteos: `metricas.test.sql` «exactamente siete metricas_*» y contrato de firmas; `consultas.test.ts` «seis llamadas rpc».
  `getByText('Total histórico')` (Vitest y e2e) se rompe si el texto aparece en encabezado y descripción.
- No hay semilla SQL (`config.toml` `sql_paths = []`): una verificación que cite «datos de la semilla» no aplica salvo usuarios.

Crítica del código (2026-11-13), todo bajo; el invariante bajo concurrencia se sostiene (lock de la fila del `update` + `on conflict`):
- **Tabla de conteo con `default 0`:** el `insert` del upsert omitía la columna y la primera descarga del día quedaba en 0 (bug de la spec,
  arreglado con `1` explícito). Pedir `not null check (> 0)` sin default, para que la tabla sostenga el invariante.
- **Tabla nueva sin auditar en `historial/entidades.ts`:** el precedente es excluirla de `TablaAuditada` (`intento_descarga`), no mapearla a
  una entidad filtrable existente («Descarga» = vinculaciones de `registro_descarga`).
- Los e2e que la spec lista suelen quedar para `qa`: verificar si siguen pasando por casualidad (p. ej. `cell().last()`) y qué no cubren.

**Why:** el endpoint anónimo es el único camino de escritura sin sesión; lo que ahí crece por llamada es un vector de agotamiento, no solo
de métricas, y la forma de la tabla no se corrige después (migraciones inmutables).

**How to apply:** en toda tabla nueva que escriba una RPC `anon`, preguntar si crece por llamada y si un agregado alcanza. Ver la `## Respuesta`
de `docs/specs/descargas-normativas-periodo/critica.md`. Relacionado: [[limite-frecuencia-trampas]], [[metricas-periodo-trampas]],
[[auditoria-falla-cerrada]], [[postgres-rpc-triggers-trampas]].
