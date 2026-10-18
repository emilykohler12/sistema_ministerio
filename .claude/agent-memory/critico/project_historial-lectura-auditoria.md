---
name: historial-lectura-auditoria
description: Trampas vistas en la spec historial-operaciones (2026-10-18), primera lectura paginada de registro_operacion: diff vacío por updated_at, PGRST103 con count exact, mapa de tablas no exhaustivo, helpers de fecha atrapados en dashboard, email varchar de auth.users, verificación con sin-permiso imposible por UI
metadata:
  type: project
---

En la crítica de la spec `historial-operaciones` (#20, 2026-10-18), primera pantalla que lee `registro_operacion` y primera con `.range()`:
- **Diff vacío:** `guardar_taller` siempre hace el UPDATE del taller (aunque solo cambien las puentes) y `tocar_updated_at()` cambia
  `updated_at`, así que `auditar()` registra una "Modificación" cuyo único cambio es ese campo. Lo mismo pasa con cualquier "Guardar" sin
  cambios. Si el diff excluye `updated_at`, queda vacío: hay que definir qué se muestra.
- **`count: 'exact'` + offset mayor que el total → 416 / `PGRST103`**, no un array vacío (sin count sí da vacío). "Página fuera de rango =
  vacío" cae en la rama de error. No lo verifiqué en la base.
- **Un mapa tabla → X en TS** se hace exhaustivo con `Record<Exclude<keyof Database['public']['Tables'], ...>, X>` + `satisfies`: una tabla
  nueva rompe el typecheck después de `db:types` (el equivalente de las guardias de 0013 para el cliente).
- **`hoyArgentina`, `esFechaReal`, `sumarDias` y `FECHA_MINIMA` viven en `dashboard/periodo.ts`.** Toda feature con fechas nueva tiende a
  copiarlos, y la regla de imports entre dominios lo obliga. Propuse mudarlos a `shared/lib/date.ts`, con un formateador con `timeZone`.
- **`auth.users.email` es `varchar(255)`:** en plpgsql, `return query` contra `returns table (email text)` da 42804. Hace falta un cast o `language sql`.
- **`sin-permiso@dam.local` no entra al panel** (`AuthContext` lo rechaza al iniciar sesión): una verificación "por la UI con esa cuenta"
  no se puede ejecutar. El molde es la llamada REST de `e2e/dashboard.spec.ts`.
- Parámetros de la URL que llegan al query builder sin sanear (uuid inválido → 22P02, página ≤ 0 → range negativo) dejan "Reintentar" para siempre.
- Correcto, no lo marques: `order by id` y no `fecha_hora`, porque las filas de una transacción comparten `now()` y el offset sería inestable.

En la crítica del código (2026-10-18) salieron tres patrones que se van a repetir:
- **`type="date"` atado directo a la URL**, sin borrador ni espera: cada tecla del año da una fecha intermedia válida (`0002-…`), que
  consulta y hace `push` al historial. El molde es `SelectorPeriodo` (300 ms + `replace`). Mirá también si el parámetro `replace` está muerto.
- **Deshabilitar el botón de paginación con `isPlaceholderData`** (lo propuse yo en la spec) hace que el foco del teclado pase al `body`
  (focus fixup). El dashboard solo usa `aria-busy`. No vuelvas a proponer `disabled` en un control que se acaba de presionar: usá `aria-disabled`.
- **Rechazar mudar helpers "porque ya no hacen falta"** terminó en una copia con otro nombre (`fechaReal`, `aTimestamp`). En cualquier
  feature con fechas, buscá `setUTCFullYear` y `padStart(4` duplicados.

**Why:** son fallas visibles en el caso feliz (detalle vacío, error en lugar de vacío) que ni el typecheck ni el pgTAP detectan.

**How to apply:** en cualquier lista paginada, lectura de la auditoría o feature con fechas, revisar estos puntos. Ver la `## Respuesta` de
`docs/specs/historial-operaciones/critica.md` para saber qué se aceptó. Relacionado: [[metricas-periodo-trampas]], [[frontend-cortes-patrones]],
[[postgres-rpc-triggers-trampas]].
