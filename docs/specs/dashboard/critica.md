# Crítica de la spec: dashboard (borrador del 2026-10-16)

## Veredicto
Hay mejoras

Si solo se cambia una cosa: que el filtro del período (hora de Argentina, bordes, `42501` y `22023`) viva en una sola función
auxiliar que usen las 6 RPC, y no copiado seis veces.

## Puntos

1. **El filtro del período se escribe y se prueba seis veces** (alta). Cada RPC repite el chequeo `es_admin()`, la validación
   del período y la conversión de `[desde, hasta]` a la hora de Argentina. Es justo la parte donde están los errores sutiles
   (punto 4) y el criterio 10 tendría que probar los bordes en cada una. Si una sola RPC filtra distinto, el resumen y la serie
   dejan de cuadrar y ningún test lo detecta.
   - **Propuesta:** una función `metricas_registros(p_desde date, p_hasta date)`: invoker, `search_path=''`, `stable` y EXECUTE solo
     para `authenticated`, que es obligatorio porque el EXECUTE también se chequea en las llamadas anidadas. Hace el `42501`, el
     `22023` y el filtro sargable:
     ```sql
     r.fecha_hora >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and r.fecha_hora < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
     ```
     Devuelve las columnas que hacen falta y además `dia date` (ya en hora de Argentina). Las 6 RPC hacen `select ... from
     public.metricas_registros(p_desde, p_hasta)` y pueden ser `language sql`. Que quede expuesta como RPC no abre nada: el admin
     ya tiene SELECT sobre la tabla, y cualquier otro usuario recibe `42501`.
   - **Qué se gana:** la zona horaria y los bordes se prueban una sola vez. Cada RPC prueba solo su agregación. Cambiar un
     indicador sigue sin arrastrar a los demás, porque las reglas del período son las mismas para todos.

2. **Con el filtro `PADRON`, la vinculación nunca mejora la cobertura, y la localidad del establecimiento alcanzado no está
   definida** (alta). La 0010 dice que la cobertura se vuelve confiable *con* la vinculación. Pero una OTRA vinculada sigue
   siendo `institucion_tipo = 'OTRA'` y solo gana el `establecimiento_id`. Con el criterio 6 tal como está escrito, esas
   instituciones no cuentan nunca. Además, el KPI y la columna "alcanzados" usan definiciones distintas con el mismo nombre,
   así que la suma de la tabla no da el KPI y nadie va a saber por qué. Tampoco se dice si el alcanzado va a la localidad
   declarada (`registro.localidad_id`) o a la del establecimiento. El padrón (el denominador) se cuenta por
   `establecimiento.localidad_id`.
   - **Propuesta:** una sola definición: "alcanzado" = `establecimiento_id` distinto y no nulo, sin mirar el tipo. En la tabla
     por localidad, atribuirlo por `establecimiento.localidad_id`, igual que el padrón. Para que la cobertura no pase de 100 %,
     filtrar los activos solo en el numerador de la cobertura, y explicarlo en el texto de la sección. "Descargas" por localidad
     sigue usando la localidad declarada (§8.4, hecho histórico). Escribirlo así en el criterio.
   - **Qué se gana:** la cobertura sube cuando se vincula, que es lo que pide la 0010, y el número se puede explicar.

3. **Los porcentajes y la cobertura se calculan en la base** (media). La spec no dice dónde se calculan, y si se hacen en SQL
   aparecen tres problemas:
   - `db:types` tipa no nulas las columnas de `RETURNS TABLE`, así que una cobertura `null` (padrón 0) llega tipada como
     `number`.
   - El redondeo lo decide la base.
   - El paso 2 de la verificación ("nivel y cargo suman 100 %") falla con tres cargos distintos: 33,3 × 3 = 99,9.
   - **Propuesta:** que las RPC devuelvan solo conteos enteros (`descargas`, `alcanzados`, `padron`) y que una función pura del
     cliente calcule `porcentaje(n, total)` y `cobertura(alcanzados, padron) → number | null`, con su test. En la verificación,
     pedir conteos y no "suman 100 %".
   - **Qué se gana:** tipos honestos, sin `null` escondido, y el redondeo se prueba con Vitest y no con pgTAP.

4. **La granularidad se decide en dos lados y el mes se trunca con la zona de la sesión** (media).
   - `periodo.ts` calcula la granularidad, pero `metricas_por_periodo(p_desde, p_hasta)` no la recibe, así que la regla de
     "92 días" también va a estar en SQL. Son dos copias que se pueden desalinear: la serie llegaría por día y el eje la
     rotularía por mes.
   - `date_trunc('month', fecha_hora)` sobre un `timestamptz` usa la `TimeZone` de la sesión, que en Supabase es UTC. Un
     registro del 31 a las 22:00 en Argentina cae en el mes siguiente.
   - **Propuesta:** agregar `p_por_mes boolean` (o `p_granularidad text` validado con `22023`), que decide solo `periodo.ts`.
     El SQL agrupa por `dia` o por `date_trunc('month', dia)::date` sobre la fecha ya convertida (la `dia` del punto 1). No hace
     falta mover la serie al cliente: un rango diario de varios años pasaría el `max_rows = 1000` de PostgREST, que trunca
     sin avisar.
   - **Qué se gana:** una sola fuente de la regla y meses correctos en los bordes.

5. **Los bordes del período tienen tests que solo prueban inclusiones** (media). Los dos casos del criterio 10 (23:30 del último
   día y 00:00 UTC del día siguiente) entran. Una implementación con el rango demasiado ancho los pasa igual: por ejemplo,
   `<= hasta + 1` o `between` sobre timestamps.
   - **Propuesta:** sumar las dos exclusiones: 00:00 en Argentina del día siguiente (03:00 UTC) no entra, y 23:59 en Argentina
     del día anterior a `desde` (02:59 UTC) tampoco. Sumar también la inclusión de 00:00 en Argentina de `desde`. Con el punto
     1, son cinco tests en total y no treinta.
   - **Qué se gana:** tests que distinguen el filtro bueno de uno que se pasa por un día.

6. **"Hoy", "últimos 30 días" y "año en curso" no están definidos en el cliente** (media). Si `periodo.ts` arma `hasta` con
   `new Date().toISOString().slice(0, 10)`, toma la fecha en UTC: después de las 21:00 en Argentina, "hoy" pasa a ser mañana, la
   serie muestra un día futuro en 0 y la clave de caché cambia antes de tiempo. La spec tampoco dice si 30 días es
   `[hoy-29, hoy]` o `[hoy-30, hoy]`, ni si el año en curso termina hoy o el 31 de diciembre. Si termina el 31, la serie muestra
   meses futuros en 0.
   - **Propuesta:** en el criterio 1, escribir `hoy` = fecha en `America/Argentina/Buenos_Aires` (`Intl.DateTimeFormat('en-CA',
     { timeZone })`), 30 días = `[hoy-29, hoy]` y año = `[1-ene, hoy]`. `periodo.ts` recibe `ahora: Date` como parámetro para
     poder testearlo. Dejar escrito que el año en curso se ve por día hasta abril y por mes desde ahí, para que no parezca un bug.
   - **Qué se gana:** evita un error de un día que solo aparece de noche.

7. **Los tests de privilegios se repiten 6 veces** (media). El criterio 9 son unas 5 aserciones por RPC: invoker,
   `search_path`, sin anon ni public, `42501` y `22023`. Con 6 RPC son unas 30 aserciones copiadas, y la séptima RPC que se agregue
   cuando se valide C-11 va a depender de que alguien se acuerde de escribirlas.
   - **Propuesta:** en `metricas.test.sql`, un bloque que recorra
     `pg_proc where pronamespace = 'public'::regnamespace and proname like 'metricas\_%'` y verifique en una consulta que todas
     son `not prosecdef`, tienen `search_path=""` y no dan EXECUTE a `anon`. El `42501` se verifica con un `throws_ok` por
     función o con un `format()` en un bucle. Con el punto 1, el `22023` se prueba una vez en la auxiliar. Si prefieren ir más
     lejos: hoy todas las funciones de `public` fijan `search_path=''`, así que una guardia `funciones_global` (molde 0013,
     con lista de excepciones para anon) lo cubriría también para los cortes futuros.
   - **Qué se gana:** menos test copiado, y una RPC nueva con el prefijo queda cubierta sin escribir nada.

8. **"Sin vincular" agrupa por nombre sin la localidad** (media). En el padrón el nombre es único *por localidad*
   (`establecimiento_localidad_nombre_uniq`). "Escuela N° 5" de Posadas y la de Oberá son dos instituciones, y el aviso las
   cuenta como una. Además, la pantalla futura de "sin vincular" tiene que agrupar con la misma clave, o el número del aviso no
   va a coincidir con la cantidad de filas que muestre.
   - **Propuesta:** contar los pares distintos `(localidad_id, lower(inmutable_unaccent(btrim(institucion_otra))))` con
     `establecimiento_id is null`, que es la misma expresión de los índices de unicidad. Anotar en Brechas que la pantalla usa
     esa clave. Que no tenga período está bien: es trabajo pendiente, no actividad.
   - **Qué se gana:** el aviso y la pantalla futura cuentan lo mismo.

9. **El paso 1 de la verificación no genera 3 registros** (media). `visita.ts` marca el taller en `sessionStorage` y en un `Set`
   de módulo, así que en la misma pestaña la segunda y la tercera descarga del mismo taller no llaman a la RPC. Además, el
   formulario queda recordado. Con un solo taller, el paso 2 ve "descargas = 1".
   - **Propuesta:** escribir "3 descargas de 3 talleres distintos" o "en 3 ventanas privadas", y comprobar que el seed tenga 3
     talleres publicados con recursos (el botón solo aparece si el taller tiene recursos). Ajustar los esperados del ranking y de
     nivel.
   - **Qué se gana:** una verificación que se puede cumplir tal como está escrita.

10. **recharts queda para un solo gráfico** (baja). La spec ya pasa a HTML tres de los cuatro gráficos y exige además una tabla
    `sr-only` para la serie. Con 92 barras como máximo por día, o pocas por mes, una tabla con una barra CSS por fila resuelve las
    dos cosas a la vez, es la misma estructura que nivel, cargo y localidad, y se puede verificar en jsdom (hoy
    `ResponsiveContainer` mide 0×0).
    - **Propuesta:** serie en HTML y `npm uninstall recharts`. Actualizar la fila de Recharts en §8 de la definición.
    - **Qué se gana:** una dependencia menos para mantener, sin dos representaciones de los mismos datos y con la serie
      testeable. Si prefieren la línea por estética, también es defendible.

11. **Período inválido y escalera de estados** (baja). Con `desde > hasta` el hook queda `enabled: false` y, en React Query 5,
    eso es `isPending` para siempre: si la página decide por `isPending`, los skeletons se quedan junto al error de los campos.
    Además, cada cambio de período cambia la clave y la página vuelve a los skeletons.
    - **Propuesta:** que la página resuelva primero si el período es inválido y recién después muestre carga, error o datos. Usar
      `placeholderData: keepPreviousData` en `useMetricas`.
    - **Qué se gana:** no aparecen skeletons eternos y no parpadea al cambiar el período.

12. **Pequeñas duplicaciones de datos** (baja).
    - La cantidad de normativas sale de `metricas_resumen` y también del select de la lista. Mejor tomarla de `lista.length` y
      sacarla de la RPC.
    - "Cargo: aparecen los 6" obliga a escribir la lista por tercera vez, en SQL (ya está en el CHECK y en `CARGOS`). Si
      después se agrega un cargo, la RPC no lo muestra y nada falla. Alternativa: `group by cargo` en SQL y completar los ceros
      en el cliente. Pero `CARGOS` es del dominio `descargas` y la regla de `datos.md` prohíbe importarlo, así que habría que
      mudarlo a `shared/` o aceptar que se vean solo los cargos con descargas. Para nivel no pasa: `nivel_educativo` es una
      tabla y alcanza con un `left join`.
    - **Qué se gana:** una fuente por dato.

13. **Rango sin tope** (baja). Un `<input type="date">` acepta el año 0001 o el 9999. Con la serie por mes, un rango de más de
    83 años pasa las 1000 filas y PostgREST la trunca sin error.
    - **Propuesta:** validar `desde >= 2020-01-01` (o la fecha del primer registro) en `periodo.ts` y en la auxiliar (`22023`).
    - **Qué se gana:** se cierra un caso límite casi gratis.

## Sobre las preguntas del pedido (sin hallazgo)
- **6 RPC vs. 1 jsonb vs. vistas:** se quedan las 6 RPC.
  - Una RPC `jsonb` llega como `Json` y obliga a tipar a mano, contra la 0012.
  - Como las migraciones no se editan, cambiar un indicador de una función única implica redefinir el jsonb entero.
  - Una vista invoker no recibe parámetros, y "distintos en el período" no se puede armar con parciales por día: habría que
    traer filas crudas, con el tope de 1000.
  - Los 6 round-trips en paralelo no pesan para una sola pantalla del admin. El costo real era el test repetido (puntos 1 y 7).
- **Invoker + `es_admin()` explícito:** está bien así. La RLS queda como segunda barrera, y el `42501` evita ceros que parecen
  datos.
- **Índice por `fecha_hora`:** prematuro para el volumen esperado, pero cuesta una línea y no estorba. Solo sirve si el filtro es
  sargable (punto 1). Para el año en curso Postgres va a hacer igual un seq scan, y eso está bien.
- **¿Partir el corte?** No hace falta. Las fases A y B ya funcionan como punto de control, y los indicadores son independientes.
  Si aprieta el tiempo, lo único que se puede postergar sin perder sentido es "Rango" (URL con fechas, validación y error). Los
  dos preajustes cubren el uso diario.

## Respuesta

| # | Respuesta | Motivo / cómo queda |
|---|---|---|
| 1 | **Acepto** | Auxiliar `metricas_registros(p_desde, p_hasta)`: invoker, EXECUTE solo para `authenticated`, con el `42501` y el `22023`. Filtro sargable en hora de Argentina y columna `dia`. Las 6 RPC leen de ahí y los bordes se prueban una sola vez. |
| 2 | **Acepto** | Una sola definición de "alcanzado": `establecimiento_id` no nulo, atribuido por `establecimiento.localidad_id`. El numerador de la cobertura cuenta solo activos. Así la vinculación futura mejora la cobertura sin tocar la RPC. |
| 3 | **Acepto** | Las RPC devuelven solo conteos. Porcentajes y cobertura en `calculos.ts`, puro. La verificación pide "porcentajes que suman ~100 %", no un 100 exacto. |
| 4 | **Acepto** | `metricas_por_periodo(p_desde, p_hasta, p_por_mes boolean)`. Decide `periodo.ts` y se trunca la fecha local, no el `timestamptz`. |
| 5 | **Acepto** | Se agregan las exclusiones: 00:00 en Argentina del día siguiente a `hasta` y 23:59 en Argentina del día anterior a `desde`. |
| 6 | **Acepto** | "Hoy" en hora de Argentina con `Intl`. 30 días = `[hoy-29, hoy]` y año en curso = `[1 de enero, hoy]`. |
| 7 | **Acepto en parte** | En `metricas.test.sql`, un recorrido de `pg_proc` sobre `metricas_%` (invoker, `search_path`, sin `public` ni `anon`). La guardia `funciones_global` es transversal y queda en `notas.md`. |
| 8 | **Acepto** | Clave `(localidad_id, nombre normalizado)`, la misma que usará la pantalla de vinculación. |
| 9 | **Acepto** | La verificación usa 3 talleres distintos. |
| 10 | **Acepto** (lo decidió el usuario) | La serie va en una tabla HTML con barras, se hace `npm uninstall recharts` y se actualiza §8 de la definición. |
| 11 | **Acepto** | La página resuelve primero si el período es inválido, y el hook usa `placeholderData: keepPreviousData`. |
| 12 | **Acepto** | El total de normativas sale de `lista.length`. Cargo: `group by` en SQL y se muestran solo los cargos con descargas, sin mudar `CARGOS` (no se agranda el alcance). Nivel con `left join` a `nivel_educativo`. |
| 13 | **Acepto** | `desde >= 2020-01-01` y `hasta <= hoy`, en `periodo.ts` y en la auxiliar (`22023`). |

## Crítica del código

### Veredicto
Hay mejoras, todas menores (no hay altas ni medias). El diseño sigue la spec y la crítica respondida: el período está en un
solo lugar, las RPC devuelven solo conteos y los cálculos son puros y están testeados.

Si solo se cambia una cosa: que los datos del período anterior se vean como "actualizando" mientras llegan los nuevos
(`isPlaceholderData`).

### Puntos

1. **Datos del período anterior sin ninguna señal** (baja). Con `keepPreviousData`, al pasar de "Últimos 30 días" a "Año en
   curso" el toggle ya marca el período nuevo, pero los KPIs y las tablas siguen mostrando los números de los 30 días hasta que
   terminan las 7 consultas. El test de `DashboardPage` (línea 204) lo confirma: `Descargas = 12` queda a la vista con "Año en
   curso" marcado. Con la red lenta, el admin puede leer o capturar números que corresponden a otro período.
   - **Propuesta:** `useMetricas` ya devuelve `isPlaceholderData`. Usarlo en el contenedor de `ContenidoMetricas`, con
     `aria-busy={isPlaceholderData}` y una clase `opacity-60` (o un texto "Actualizando…"). Sumar esa aserción al test existente.
   - **Qué se gana:** se mantiene el "sin parpadeo" del punto 11 y además ningún número se ve atribuido al período equivocado.
     Son una línea y una aserción.

2. **`etiquetaDe` duplica `formatFechaCorta` de `shared/lib/date.ts`** (baja). En `SerieDescargas`, la rama por día es
   exactamente `formatFechaCorta`: separa la fecha, arma `new Date(a, m-1, d)` y llama a `toLocaleDateString('es-AR')`. La rama
   por mes repite el mismo armado.
   - **Propuesta:** usar `formatFechaCorta(p.inicio)` para el día y sumar `formatMes(fechaIso)` (mes largo y año) en
     `shared/lib/date.ts`, junto a las otras.
   - **Qué se gana:** un solo lugar donde se interpreta `AAAA-MM-DD` como fecha local. Si algún día cambia el criterio (por
     ejemplo, a `timeZone` explícita), se toca una función y no dos.

3. **El mapa estado → variante del `Badge` está copiado de `TalleresListPage`** (baja). `VARIANTE_ESTADO` está idéntico en
   `TablaRanking` y en `pages/admin/talleres/TalleresListPage.tsx`. La etiqueta, en cambio, llega por la prop `etiquetasEstado`
   para no importar de `talleres`. El resultado es que la mitad del badge viaja por prop y la otra mitad se copia.
   - **Propuesta:** un `BadgeEstadoTaller({ estado })` en `features/talleres/components/` (etiqueta + variante), que use
     `TalleresListPage`. `TablaRanking` recibe `renderEstado: (estado) => ReactNode` en lugar de `etiquetasEstado`, y la página
     le pasa `(e) => <BadgeEstadoTaller estado={e} />`. La regla de `datos.md` se sigue cumpliendo, porque quien compone es la
     página.
   - **Qué se gana:** un cambio de color o de texto de un estado se hace en un solo lugar, y el dashboard no puede quedar
     desalineado con el listado de talleres.

4. **Bloques pgTAP redundantes y fallas difíciles de leer** (baja).
   - El bucle "anon: las siete funciones dan 42501 (sin EXECUTE)" (líneas 388-413) no prueba lo que dice su título. Si anon
     tuviera EXECUTE, igual recibiría `42501` por el `es_admin()` de la auxiliar. Lo que sí prueba la falta de EXECUTE es el
     `has_function_privilege('anon', …)` de la línea 137.
   - Los dos bucles que quedan (`42501` sin marca y `22023` propagado) comparan un contador con `'7'`. Si una RPC deja de
     propagar el error, el mensaje es "got 6, expected 7" y no dice cuál falló.
   - **Propuesta:** borrar el bucle de anon. En los otros dos, acumular las llamadas que **no** dieron el código
     (`fallidas := fallidas || c`) y verificar `is(fallidas, '')`.
   - **Qué se gana:** unas 25 líneas menos, sin perder cobertura, y una falla que nombra la RPC culpable.

### Sobre las preguntas del pedido (sin hallazgo)

- **`perform 1 from metricas_registros(...) limit 1` al inicio de cada RPC:** está bien así para este volumen.
  - Hace un recorrido doble completo. Una función plpgsql con `return query` materializa todo su resultado antes de devolverlo,
    así que el `limit 1` no corta nada: el período se lee dos veces. Con decenas de miles de registros por año, eso son
    milisegundos.
  - El motivo que da el comentario es correcto. Si el `join` con `taller` está vacío, o si el `generate_series` queda vacío, el
    plan puede no evaluar nunca el CTE, y el `42501` y el `22023` no se propagarían.
  - La alternativa limpia sería una `metricas_validar(p_desde, p_hasta) returns void` con los dos `raise`, llamada con `perform`
    desde las 6 RPC y desde la auxiliar: un solo recorrido y la intención explícita, sin depender de un efecto lateral. Pero la
    migración ya está commiteada, y cambiarla exige otra que redefina 7 funciones y sus grants: es más código del que ahorra.
    Conviene hacerlo solo si C-11 obliga a una migración nueva de métricas.
- **Cantidad de componentes:** están en su medida.
  - `Seccion` tiene 6 usos y `TablaPorcentajes` 2 (nivel y cargo). `Barra` y `VerTodos` tienen 2 cada uno.
  - `TablaNormativas` tiene un solo uso, pero deja la página como pura composición.
  - Fusionar `SerieDescargas` con `TablaPorcentajes` pediría flags (columna de porcentaje, máximo relativo o 100), y una
    `<Tabla columnas>` genérica en `shared/` sería prematura: las otras tablas del panel tienen otra forma.
- **Retraso con estado local vs. URL:** está bien así.
  - La URL es la única fuente de la consulta y el `borrador` vive solo en los campos.
  - La alternativa (URL inmediata con `replace` y un `useDebouncedValue` del período consultado) traslada el problema sin
    resolverlo. Haría falta un hook nuevo, el error "anterior a 2020" parpadearía con cada año a medio tipear (0002, 0020, 0202),
    y la URL dejaría de coincidir con lo que se ve.
  - Remontar el selector con `key` cuando cambia la URL perdería el foco del campo cuando entra el propio commit.
  - El par `vistos`/`borrador` es el patrón documentado de React para ajustar el estado cuando cambia una prop.

## Respuesta (código)

| # | Respuesta | Motivo / cómo queda |
|---|---|---|
| 1 | **Acepto** | Es casi gratis y evita que se lean números del período anterior como si fueran del nuevo: `aria-busy` y `opacity-60` con `isPlaceholderData`, más la aserción en el test. |
| 2 | **Acepto** | Es trivial: usar `formatFechaCorta` y sumar `formatMes` en `shared/lib/date.ts`. |
| 3 | **Rechazo en este corte** | Toca el dominio `talleres` y `TalleresListPage`, fuera del corte. Va a `notas.md`. |
| 4 | **Acepto** | Es trivial: se borra el bucle anon (lo cubre `has_function_privilege`) y los otros dos bucles acumulan las RPC que fallan. |
