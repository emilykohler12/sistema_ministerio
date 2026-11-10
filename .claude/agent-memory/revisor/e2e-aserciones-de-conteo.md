---
name: e2e-aserciones-de-conteo
description: Tests Playwright que cuentan requests (`consultas++`) y asertan el número sin esperar el evento: flaky si esperan 1, vacuos si esperan 0 (#49 historial, #40)
metadata:
  type: project
---

En `e2e/historial.spec.ts` (#49) `expect(consultas).toBe(1)` se evaluaba después de `toHaveURL` y de `table` visible, pero con
`keepPreviousData` la tabla vieja sigue en pantalla y la consulta sale un tick después: contaba 0. Se arregló armando
`page.waitForResponse(predicado)` **antes** de la acción y esperándola antes del conteo. #40 es el mismo tipo de problema en otro archivo.

Lo mismo al revés: `expect(consultas).toBe(0)` justo después de ver un error es vacuo (la consulta que no debería salir saldría en el
efecto posterior al render). Lo vi en historial.spec.ts:105 (rango invertido); quedó como observación fuera de alcance.

**Why:** una URL o un elemento visible no prueban que la red ya respondió; el listener de `request` cuenta en otro tiempo.
**How to apply:** en un e2e que cuente requests, buscá que el conteo espere un evento de red (waitForResponse armado antes de la
acción). Para verificar que todavía detecta "N consultas en lugar de 1", razoná si las extra salen antes del punto de espera (en
historial las fechas intermedias `0002-…` salen antes de la URL final, así que el conteo falla). Ver [[hooks-frontmatter-no-invocados]]:
el revisor no puede correr Playwright.
