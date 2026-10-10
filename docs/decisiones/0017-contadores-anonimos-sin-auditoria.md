# 0017 · Contadores anónimos fuera de la auditoría, con `WHEN` en los triggers y grant por columna

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
`normativa.descargas` lo incrementa cualquier visitante a través de una RPC (0007). Como es un UPDATE, dispara `auditar()` (0013) y
`tocar_updated_at()`. Así, cada descarga ensuciaría el historial de operaciones con filas sin usuario y `updated_at` dejaría de significar
"editada por el admin". Surgió en el corte normativas (`docs/specs/normativas/`).

## Opciones consideradas
- **Auditar cada descarga:** es lo más simple, pero llena el historial (§5.2) de ruido y cambia el sentido de `updated_at`.
- **Tabla aparte de contadores:** obliga a abrir una excepción en la guardia `auditoria_global` y se aparta de §8.3.
- **`WHEN` que excluya el contador:** la regla vive en la tabla y se puede probar con pgTAP.

## Decisión
- La tabla tiene dos triggers de auditoría:
  - `after insert or delete`, sin condición;
  - `after update`, con condición.

  Postgres no admite un `WHEN` con `OLD` en un trigger que también corre en el insert, por eso van separados.
- Los triggers de update (`auditar()` y `tocar_updated_at()`) se omiten solo si lo único que cambió es el contador:
  `when (old.descargas = new.descargas or (to_jsonb(old) - 'descargas' - 'updated_at') is distinct from (to_jsonb(new) - 'descargas' - 'updated_at'))`.
- El grant de UPDATE por columna excluye el contador. Desde la API, solo lo modifica una RPC security definer (`search_path=''`, EXECUTE
  para `anon` y `authenticated`).

## Consecuencias
- Un UPDATE que toque el contador y otra columna, aunque venga de `service_role`, sí se audita.
- Las guardias globales solo verifican que el trigger exista y no miran el `WHEN`. Cada contador necesita un test de comportamiento.
- El dashboard (§5.4) y cualquier contador futuro reutilizan este patrón.
