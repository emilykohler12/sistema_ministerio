# Plan: e2e flaky de historial «filtros inválidos, vacíos y URL compartible» (#49)

**Objetivo.** Que `e2e/historial.spec.ts:88` deje de fallar de forma intermitente. Es un cambio solo del test; la app no se toca.

**Causa (reproducida).** Con `--retries=0 --repeat-each=8` del archivo entero fallaron 2 de 6 y 1 de 8, siempre en `expect(consultas).toBe(1)` (línea 139). Con una aserción que imprime lo contado, el valor recibido fue `[]`: **cero** consultas. El orden real es:
1. Se escribe la fecha; tras la espera de 300 ms la URL cambia (`replace`) a `?desde=<hoy>`.
2. `toHaveURL(desde=hoy)` pasa de inmediato.
3. `expect(table).toBeVisible()` también pasa: con `keepPreviousData` la tabla de la vista anterior sigue en pantalla.
4. `expect(consultas)` se evalúa antes de que React emita la consulta con `fecha_hora=gte...`, que llega ~1 tick después (en el trace aparece a 6855 ms, justo después).
No es un defecto de la app: la consulta sí es una sola. La aserción no espera a la consulta, solo a la URL.

**Arreglo.** Antes de escribir la fecha, `const respuesta = page.waitForResponse(r => r.url().includes('/rest/v1/registro_operacion') && r.url().includes('fecha_hora=gte.'))`; después de `toHaveURL`, `await respuesta`; recién entonces `expect(consultas).toBe(1)`. Así espera el hecho que verifica, y un segundo pedido (la regresión que el test cuida: una consulta por cada dígito) seguiría haciendo fallar el conteo.

**Archivos.** `e2e/historial.spec.ts` (solo ese test).

**Pasos.** 1) Aplicar el cambio. 2) `npx playwright test e2e/historial.spec.ts --retries=0 --repeat-each=10`: 10 corridas seguidas sin fallos (hoy falla ~1 de 5). 3) `npm run lint`, `npm run typecheck`. 4) `npm run test:e2e` completo como regresión y `npm run db:reset`.

**Observación, fuera de alcance.** Ejecutado solo (`historial.spec.ts:88`) sobre una base recién reseteada falla siempre, porque no hay operaciones y no se renderiza la tabla: el test depende de que el test 1 del archivo haya creado historial. En la corrida normal del archivo y en la completa no pasa. Se anota un comentario en el test; sembrar los datos propios sería otro cambio.

**Fuera de alcance.** La app, `RangoFechas`, el debounce, #40 (mismo tipo de problema pero otro archivo).

**Verificación.** Cambio solo de test: sin `qa` (no toca Storage, permisos de anon ni rutas).
