# 0015 · Enum de Postgres para listas cerradas; varchar + CHECK para listas con "Otro"

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
La definición §8.3 modelaba como `varchar` todas las listas de valores (`taller.estado`, `recurso.tipo`, `institucion_tipo`, `cargo`). Con
0012 los tipos del frontend se derivan de la base, pero `db:types` genera `string` para un `varchar` con CHECK, así que habría que escribir
la unión a mano. Surgió en el corte `talleres` (crítica, punto 9), y cada corte con una lista nueva la volvería a discutir.

## Opciones consideradas
- **Siempre varchar + CHECK:** fácil de cambiar, pero el tipo TS se escribe a mano y puede desalinearse sin que `tsc` avise.
- **Siempre enum:** la unión se genera sola, pero no sirve para listas con "Otro" ni donde el valor se valida contra texto libre.
- **Criterio por tipo de lista.**

## Decisión
- Una lista cerrada que el frontend usa como tipo es un `enum` de Postgres. El primero es `estado_taller`, y `recurso.tipo` va a ser el siguiente.
- Una lista con "Otro" o que se valida contra texto libre es `varchar` + CHECK, como `cargo` (§8.4).
- En el frontend se usa `Enums<'x'>` y `Constants.public.Enums.x`, por ejemplo en `z.enum`. Las etiquetas visibles van en un objeto con `satisfies Record<…, string>`.

## Consecuencias
- Si la base agrega un valor al enum, `tsc` marca cada mapa de etiquetas que no lo cubra.
- Postgres no permite quitar ni renombrar valores de un enum sin recrear el tipo. Solo conviene para listas estables.
- El criterio queda anotado en la definición, §8.3.
