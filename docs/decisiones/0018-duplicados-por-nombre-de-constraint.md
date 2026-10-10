# 0018 · Los duplicados se distinguen por el nombre de la constraint

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
`establecimiento` tiene dos únicos (CUE; localidad + nombre normalizado) y los dos dan 23505. El formulario necesita marcar el campo
correcto. PostgREST no expone la constraint en un campo propio: el nombre solo llega dentro de `error.message` (verificado en el corte padrón).

## Opciones consideradas
- **Consultar antes de guardar** si el CUE o el nombre existen. Suma una ida y vuelta y tiene una carrera entre la consulta y el insert.
- **Una RPC que devuelva un código propio** por cada caso. Es robusta, pero agrega una función por tabla solo para traducir errores.
- **Leer el nombre de la constraint en `message`**, con nombres explícitos y fijados por un test.

## Decisión
- Toda constraint o índice único que la UI deba distinguir lleva un nombre explícito (`<tabla>_<campo>_key` o `<tabla>_<campos>_uniq`).
- El pgTAP la fija con `throws_ok(..., '23505', '<mensaje exacto con el nombre>')`: ese es el contrato.
- El `errores.ts` del dominio (puro) exige el código 23505 **y** el nombre dentro de `message`. Un 23505 que no reconoce muestra el error general del formulario y nunca se atribuye a un campo.

## Consecuencias
- Renombrar una constraint rompe el pgTAP antes que la UI.
- Si una tabla tiene un solo único, alcanza con el código (`esNombreDuplicado` de categorías sigue igual).
- Depende del texto del mensaje de Postgres. Si una versión lo cambia, lo detecta el mismo test.
