# 0024 · Métricas por RPC invoker de solo conteos, con el período en hora de Argentina

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
§5.4 pide indicadores calculados en la base, con filtro de período, y solo para el admin. Los indicadores todavía no están validados (C-11).
`registro_descarga` guarda `fecha_hora timestamptz`, y la sesión de Postgres está en UTC. Surgió en el corte dashboard (`docs/specs/dashboard/`).

## Opciones consideradas
- **Agregar en el cliente:** choca con el tope de 1000 filas de PostgREST y expone registros crudos.
- **Una RPC que devuelva jsonb:** llega como `Json` sin tipos (contradice 0012) y, como las migraciones no se editan, cambiar un indicador obliga a redefinirla entera.
- **Vistas `security_invoker`:** no reciben parámetros, y "distintos en el período" no se puede armar sumando parciales.
- **Una RPC `returns table` por indicador, todas sobre una auxiliar del período.**

## Decisión
- `metricas_registros(p_desde, p_hasta)` es la única fuente del período:
  - chequea `es_admin()` (42501) antes de validar el período (22023, con tope `2020-01-01 ≤ desde ≤ hasta ≤ hoy`);
  - usa un filtro sargable en `America/Argentina/Buenos_Aires`, con `[desde, hasta]` inclusivo;
  - agrega la columna `dia`, la fecha local.
- Una RPC por indicador lee de esa auxiliar. Devuelve solo conteos; los porcentajes y la cobertura se calculan en el cliente, con funciones puras.
- Todas son `security invoker` con `search_path=''`, y EXECUTE solo para `authenticated`. La RLS de `registro_descarga` queda como segunda barrera.
- "Hoy" se calcula en hora de Argentina también en el cliente (`Intl`), no con `toISOString()`.
- Un establecimiento cuenta como alcanzado si hay un `establecimiento_id` no nulo. Se atribuye por `establecimiento.localidad_id`, sin filtrar por tipo, para que la vinculación futura de las instituciones "Otra" sume.

## Consecuencias
- Agregar o cambiar un indicador es una RPC nueva, sin tocar las demás.
- Cada RPC plpgsql arranca con `perform` sobre la auxiliar, para que los errores salten aunque el join quede vacío. Eso implica una doble lectura del período, aceptada por el volumen.
- Hay dos relojes ("hoy" en el cliente y en la base). Un equipo adelantado puede recibir 22023 cerca de la medianoche (`notas.md`).
