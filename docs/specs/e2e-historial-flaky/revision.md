# Revisión 1

Alcance: diff sin commitear de `fix/e2e-historial-flaky` contra `plan.md` (#49, carril chico). Único archivo de código
tocado: `e2e/historial.spec.ts` (más el `plan.md` nuevo). No se tocó nada fuera del plan.

## Veredicto
Aprobado

## Problemas
Ninguno que afecte la corrección del test o lo que pide el plan.

## Verificación de los puntos del plan

- **El `waitForResponse` se arma antes de la acción.** `e2e/historial.spec.ts:138` crea la promesa antes de `focus()` y `keyboard.type`
  (141-142) y la espera recién en la 144, después de `toHaveURL`. Si la respuesta llega antes de `toHaveURL`, la promesa ya resuelta se espera
  igual: no hay carrera nueva.
- **El patrón coincide con la consulta real.** `obtenerHistorial` agrega `.gte('fecha_hora', desde)` solo con un `desde` válido, y supabase-js lo
  serializa como `fecha_hora=gte.<AAAA-MM-DD>T00:00:00-03:00`. El prefijo `fecha_hora=gte.` no tiene caracteres que se codifiquen. Antes de
  armar la espera no queda ninguna consulta con ese filtro en vuelo: el rango invertido no consulta (el hook está deshabilitado) y las vistas
  siguientes no tienen fechas. Con la app actual (300 ms de espera en `RangoFechas`), la única consulta que coincide es la de la fecha completa.
- **El test sigue detectando la regresión que cuida (una consulta por dígito).** No pude probarlo con un cambio temporal porque el perfil del
  revisor bloquea editar código y correr Playwright, así que lo razoné leyendo el código. Si se quitara la espera, Chromium emite fechas
  intermedias válidas al escribir el año (`0002-…`, `0020-…`, `0202-…`, como dice el comentario de `RangoFechas`). `fechaReal` las acepta (solo
  exige año >= 1) y `validarFiltros` no las rechaza, así que cada una cambiaría la URL y lanzaría su propia consulta con `fecha_hora=gte.`. Esas
  consultas intermedias salen *antes* de que la URL tome `desde=<hoy>`, y `toHaveURL` (143) espera justamente esa URL final. Cuando se evalúa
  `expect(consultas).toBe(1)`, el listener ya contó al menos 3: el test falla. Hay un detalle: en ese escenario el predicado, que no fija la
  fecha, resolvería con la respuesta intermedia `0002-…` y no con la final. No cambia el resultado (el conteo ya pasa de 1), así que no es un
  problema. Fijar `gte.${hoy}` sería solo más estricto.
- **Sin restos de diagnóstico.** No hay `console.log`, `consultas` sigue siendo `let consultas = 0` (número) y el listener de `request` es el
  mismo que estaba en `main`.
- **Los comentarios son exactos.** El de 136-137 describe la causa reproducida en el plan (la URL cambia antes que la consulta y
  `keepPreviousData` deja visible la tabla anterior). El de 88 coincide con la observación del plan: sin operaciones, la 110
  (`table` visible) falla. Lo confirma el paso «Usuario "Sistema": vacío», que da por hecho que la base recién reseteada no tiene operaciones del
  sistema.

## Observación fuera de alcance (posible issue)
`e2e/historial.spec.ts:105` (`expect(consultas).toBe(0)` en el rango invertido) es del mismo tipo que #49, pero al revés: cuenta apenas se ve el
error. Si una regresión habilitara la consulta con el rango invertido, el pedido saldría en el efecto posterior al render y el conteo podría
leerse antes, así que el test pasaría igual (aserción vacua). No es parte de este plan; conviene un issue si se quiere blindar.

## Evidencia
- `npm run lint`: exit 0, 0 errores, 4 warnings ya existentes (`react(incompatible-library)` en `TallerFormPage`, `ConfiguracionPage`,
  `DescargaModal` y `only-export-components` en `AuthContext`), ninguno en `e2e/`.
- `npm run typecheck` (`tsc -b`): exit 0.
- `npm test`: 96 archivos, 1621 tests pasados.
- `npx playwright test e2e/historial.spec.ts --retries=0 --repeat-each=3`: **no corrió**. El perfil `checks` del revisor (`roles.mjs`) bloquea
  `npx playwright` y `npm run test:e2e`. Las corridas repetidas del paso 2 del plan (10 seguidas) y el e2e completo del paso 4 tienen que
  confirmarlos el coordinador o el implementador.
- `npm run db:reset`: corrido al final (sembró `admin@dam.local`, `sin-permiso@dam.local` y `recuperacion@dam.local`).
