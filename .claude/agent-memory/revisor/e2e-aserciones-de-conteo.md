---
name: e2e-aserciones-de-conteo
description: Trampas de e2e Playwright que se repiten - conteos de requests sin esperar el evento (#49) y getByLabel ambiguo tras navegar por clic desde una lista con buscador o filtro (#40, padron.spec:84)
metadata:
  type: project
---

**Conteos.** En `e2e/historial.spec.ts` (#49) `expect(consultas).toBe(1)` se evaluaba después de `toHaveURL` y de `table` visible, pero con
`keepPreviousData` la tabla vieja sigue en pantalla y la consulta sale un tick después: contaba 0. Se arregló armando
`page.waitForResponse(predicado)` **antes** de la acción y esperándola antes del conteo.

`toBe(0)` justo después de ver un error PUEDE ser vacuo, pero no siempre: en historial.spec.ts (rango invertido) se demostró en
fix/e2e-flaky-carga (2026-11) que la consulta indebida saldría al montar, antes del mensaje, y el test falló 5/5 con la regresión
inyectada. Antes de marcarlo vacuo, razoná CUÁNDO saldría la request indebida respecto del punto de espera.

**getByLabel ambiguo tras navegar por clic (#40).** `getByLabel('Título')` sin `exact` es subcadena sin mayúsculas: coincidía con el
buscador sr-only «Buscar por título, número o etiqueta» de la lista. Las rutas son `lazy` y RR7 navega en transición, así que tras el
clic en «Editar» la lista sigue en el DOM un momento y el `fill` cae en el buscador (flake ~1/15). Arreglo: esperar el `<h1>` del
formulario antes de llenar. Mismo patrón pendiente en `padron.spec.ts:83-84` (`getByLabel('Localidad')` coincide con el filtro de la
lista). Con `page.goto` directo al formulario no hay carrera.

**Why:** una URL o un elemento visible no prueban que la red ya respondió ni que la ruta nueva ya se montó.
**How to apply:** en e2e que cuenten requests, buscá un waitForResponse armado antes de la acción. En e2e que naveguen por clic y
después llenen un campo por label, buscá en la pantalla de origen labels que coincidan (subcadena, o exacto) y exigí la espera del
encabezado. Un flake de 1/15 que pasa 30/30 tras el arreglo es evidencia débil (~13 % por azar): apoyate en el mecanismo.
Ver [[hooks-frontmatter-no-invocados]]: el revisor no puede correr Playwright.
