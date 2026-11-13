# Crítica de la spec

Revisé `spec.md` (borrador, #32), `contexto.md`, los ADR 0016, 0017, 0022, 0024 y 0030, `.claude/rules/` (migraciones, datos, react),
`supabase/tests/auditoria_global.test.sql`, las migraciones de normativas, descargas, métricas y `no_contar_admin`, y los tests que nombra el contexto.
No corrí la base: lo que digo de la semántica de Postgres sale de la documentación y no lo verifiqué en local.

## Veredicto
Hay mejoras

Si solo se cambia una cosa: guardar un conteo por normativa y por día local (`descarga_normativa_dia`, upsert) en lugar de una fila por llamada anónima.

## Puntos

1. **Una fila por llamada anónima abre un crecimiento de la base sin tope que hoy no existe** (alta)
   - Evidencia: spec.md:22 (`descarga_normativa` con `id identity`, una fila por llamada); spec.md:30 y 34 («sin tope por IP (mismo nivel que el contador de hoy)»);
     contexto.md:9 (la RPC no tiene tope); `20261029130000_limite_descargas.sql`:89-99 (el único tope existe solo para talleres).
   - Problema: decir «mismo nivel que el contador de hoy» no es cierto. Hoy un script que llama a `contar_descarga_normativa` en bucle infla un
     `int` y la base no crece. Con la spec, cada llamada deja una fila con su entrada en el índice (unos 100 bytes): 100 llamadas por segundo
     durante un día son unos 8,6 M de filas, cientos de MB, en un endpoint `anon` sin sesión ni `sessionStorage` que lo frene. El riesgo pasa de
     números inflados a quedarse sin espacio en la base. Además la forma de la tabla no se corrige después: las migraciones no se editan
     (`.claude/rules/migraciones.md`) y los datos ya acumulados quedan.
   - Alternativa: una tabla agregada por día local, que alcanza para todo lo que pide la spec, porque el período siempre es de días enteros
     (spec.md:13):
     ```sql
     create table public.descarga_normativa_dia (
       normativa_id int not null references public.normativa (id) on delete cascade,
       dia date not null,
       descargas int not null default 1 check (descargas > 0),
       primary key (normativa_id, dia)
     );
     -- en contar_descarga_normativa (sigue siendo language sql, una sentencia):
     with u as (
       update public.normativa set descargas = descargas + 1
        where id = p_id and not (select public.es_admin())
       returning id
     )
     insert into public.descarga_normativa_dia as d (normativa_id, dia)
     select u.id, (now() at time zone 'America/Argentina/Buenos_Aires')::date from u
     on conflict (normativa_id, dia) do update set descargas = d.descargas + 1;
     ```
   - Qué se gana:
     - El tamaño queda acotado por normativas × días con descargas, y un abuso vuelve a costar solo números, como dice la spec.
     - El período se filtra con `d.dia between p_desde and p_hasta`. No hace falta repetir el filtro sargable con zona horaria ni sus tests de
       bordes en hora UTC: la conversión a la zona ocurre una sola vez, al escribir, con la misma expresión de «hoy» que usa `metricas_registros`.
     - No hay `identity` ni secuencia que revocar, y la PK compuesta es el único índice. Sirve para el cálculo por normativa y para la cascada
       (ver punto 6).
     - Deja lista la serie diaria que quedó fuera de alcance (spec.md:33) sin otra migración.
     - Se pierde la hora exacta de cada descarga. No se usa, y sin IP tampoco sirve para investigar un abuso.
   - Trampa que trae: `sum()` sobre un `left join` sin filas da NULL, y `db:types` tipa no nula esa columna. Hay que escribir
     `coalesce(sum(d.descargas), 0)::bigint`, con un pgTAP de «normativa sin descargas en el período → 0». Con la tabla de eventos de la spec pasa
     lo mismo si el filtro de período va en el `where` y no en el `on` del `left join`: la fila en cero desaparece. El algoritmo de
     `metricas_normativas` tiene que escribir el filtro dentro del `on`.
   - La excepción de `auditoria_global` sigue siendo de los tres eventos (28): el upsert hace UPDATE. El motivo del comentario cambia a «contador
     diario anónimo; auditarlo escribiría una fila por descarga».

2. **Dos lecturas que se unen por `id` en el cliente, cuando la RPC ya lee `normativa`** (media)
   - Evidencia: spec.md:25 («una fila por normativa, con ceros»: para eso tiene que partir de `normativa`); spec.md:27 (`NormativaConteo` suma
     `descargasPeriodo` y «se une por `id`»); `src/features/dashboard/consultas.ts`:29 (el `select` de `normativa`); `types.ts`:14.
   - Problema:
     - La unión obliga a decidir qué pasa con un `id` que está en una lista y no en la otra: una normativa creada o borrada entre las dos
       lecturas del `Promise.all`.
     - Las dos lecturas no ven el mismo momento. Una normativa nueva puede mostrar «En el período» 5 y «Total histórico» 4.
     - `descargasPeriodo` en camelCase choca con 0012, que pide tipos derivados en snake_case.
   - Alternativa: `metricas_normativas(p_desde, p_hasta) returns table (id int, titulo varchar, numero varchar, anio smallint, descargas int,
     descargas_periodo bigint)`, que parte de `public.normativa n left join ... group by n.id`. Esas columnas son todas `not null` en
     `20261010155300_normativas.sql`:10-16, así que el tipado no nulo de `db:types` es correcto. `consultas.ts` reemplaza el `from('normativa')`
     por esa RPC y `NormativaConteo` pasa a ser su `Returns[number]`. El orden sigue en `calculos.ts` (0024).
   - Qué se gana: se borra la unión y su caso borde, hay una sola lectura con un solo snapshot, y el `select` exacto que fija `consultas.test.ts`:11
     pasa a ser una llamada `rpc` más, como las otras seis. El KPI «Normativas» sigue siendo `normativas.length`.

3. **Falta el `grant select` para `authenticated`: la RPC invoker falla para el admin** (media)
   - Evidencia: spec.md:22 («`revoke all` a `anon` y `authenticated` (y a su secuencia), sin grants ni políticas de escritura»);
     `20261010180000_descargas.sql`:47-48 (el molde hace `revoke all` y después `grant select ... to authenticated`); spec.md:25
     (`metricas_normativas` es `security invoker`).
   - Problema: si se implementa tal como está escrito, el admin llama a una función invoker que lee una tabla sobre la que no tiene SELECT y
     recibe `42501 permission denied for table`. Es el mismo código que la spec usa para «no es admin» (CA 7), así que un test que solo espere
     `42501` no lo distingue.
   - Alternativa: escribir en la spec `revoke all ... from anon, authenticated; grant select ... to authenticated;` más la política
     `select using (es_admin())`, igual que `registro_descarga`. Sumar un pgTAP del admin que espere filas y no solo `lives_ok`.

4. **La spec no nombra los tests que fijan el comportamiento actual, y dos se rompen por texto duplicado** (media)
   - Evidencia y qué pasa en cada uno:
     - `supabase/tests/metricas.test.sql`:120-122 («existen exactamente las siete funciones `metricas_*`») y :150-162 (contrato de firmas de todas
       las `metricas_*`): `metricas_normativas` los rompe. Hay que sumarla a las dos listas. Los asserts de permisos de :128-147 la cubren solos.
     - `src/features/dashboard/consultas.test.ts`:11 (el `select` exacto) y :76-78 («hace exactamente seis llamadas rpc»). Además, el mock
       `porRpc[nombre]` (:46) devuelve `undefined` para una RPC que no conoce, y `leer()` la toma como error.
     - `src/pages/admin/DashboardPage.test.tsx`:510-512 usa `getByText(/Total histórico/i)`. Con una columna «Total histórico» y una descripción
       que también lo diga, hay dos coincidencias y `getBy*` lanza un error. La spec ubica `DashboardPage.tsx` en `features/dashboard`
       (spec.md:27), pero está en `src/pages/admin/`.
     - `e2e/dashboard.spec.ts`:154 `getByText('Total histórico')`: es el mismo problema con el modo estricto de Playwright.
     - `e2e/dashboard.spec.ts`:155 y `e2e/no-contar-admin.spec.ts`:24 leen `cell().last()` como el contador. Siguen andando solo si «Total
       histórico» queda como última columna. La spec no fija el orden de las columnas.
     - `supabase/tests/normativas.test.sql` (contexto.md:15, l.299-307 «anon cuenta» y l.402 «admin no cuenta»): pasan igual con cualquier
       implementación de eventos. Hay que editarlos para que exijan también la fila del día (anon) y su ausencia (admin, id inexistente), así el
       rojo sale de ahí (molde de #25).
     - `auditoria_global.test.sql`:21: la lista `values (...)` y el comentario de excepciones.
     - `src/features/historial/entidades.ts`: lo nombra la spec (spec.md:28).
   - Alternativa: una sección «Tests que cambian» en la spec con esta lista. Fijar el orden de columnas: Normativa, Número/año, En el período,
     Total histórico. El encabezado se busca con `getByRole('columnheader', { name: 'Total histórico' })`. Sumar a los dos e2e la celda «En el
     período»: 1 para el anónimo y sin cambios para el admin.

5. **`perform` sobre `metricas_registros` lee `registro_descarga` solo para validar** (baja)
   - Evidencia: spec.md:25; `20261016120000_metricas.sql`:52-54. 0024 (Consecuencias) aceptó «una doble lectura del período».
   - Problema: 0024 aceptó leer dos veces las mismas filas. Acá la RPC lee el período entero de descargas de talleres, que no usa, solo para que
     salten el `42501` y el `22023`. Con el volumen del Ministerio no pesa. El acoplamiento es solo conceptual: la validación no depende de esa
     tabla.
   - Alternativa, opcional: en la misma migración, `metricas_validar_periodo(p_desde, p_hasta) returns void` con los dos `raise`, y
     `create or replace metricas_registros` para que la llame. Así la regla del período queda en un solo lugar y `metricas_normativas` hace
     `perform public.metricas_validar_periodo(...)`. Si no quieren tocar `metricas_registros`, el `perform` de la spec es correcto y respeta el molde
     del ADR: está bien dejarlo.

6. **Índice solo por `fecha_hora`: no sirve para la cascada** (baja; solo vale si se mantiene la tabla de eventos)
   - Evidencia: spec.md:22. Postgres no crea solo el índice sobre la columna que referencia.
   - Problema: cada baja de una normativa recorre la tabla entera para borrar sus eventos. Con el conteo por normativa pasa algo parecido.
   - Alternativa: un único índice `(normativa_id, fecha_hora)`, que sirve para la cascada y para contar por normativa en el rango. Con el punto
     1, la PK `(normativa_id, dia)` ya lo resuelve.

7. **Los pasos 1 y 5 de la verificación no se pueden seguir tal como están** (baja)
   - Evidencia: spec.md:40 («el contador de la semilla»); `supabase/config.toml`:67-73 (`sql_paths = []`: no hay semilla de normativas, solo
     usuarios). spec.md:44 pide un `select count(*)`, y nadie en el flujo tiene psql.
   - Alternativa: en el paso 1, crear antes una normativa desde el panel. El paso 5 se prueba con pgTAP (borrar como `authenticated` con la marca
     una normativa con conteos y ver que no queda ninguno). Esto prueba además que la cascada corre aunque el admin no tenga DELETE sobre la tabla:
     las acciones referenciales corren como dueño de la tabla que referencia, según la documentación. No lo verifiqué en la base.

8. **El aviso alcanza, pero su justificación no es exacta** (baja)
   - Evidencia: spec.md:14 y 37.
   - Problema: «la base no la conoce de forma fiable» no es así. El `now()` de una migración es la hora en que se aplica, no la fecha de su
     nombre. Igual, mostrar esa fecha no compensa una columna o una tabla más: el aviso sin fecha alcanza. Con «30 días» recién desplegado, todo
     sale en 0 y el orden empata en el total, que es lo que se ve hoy.
   - Alternativa: que el aviso reemplace la descripción actual de la sección (`DashboardPage.tsx`:101-102) en un solo texto y no se sume un
     segundo elemento. Que no repita literal «Total histórico» (ver punto 4). Si algún día quieren la fecha, `min(dia)` da «primer registro» sin
     guardar nada más.

## Revisado sin cambios

- **Excepción en `auditoria_global` (ataque 1): está bien así.** El precedente ya existe: `intento_descarga` con 28 y `registro_descarga` con 4
  (`auditoria_global.test.sql`:6-9, 21). Lo que 0017 descartó fue reemplazar un contador por una tabla; acá la tabla agrega algo que el contador
  no puede dar, y ese es el argumento nuevo. Las otras opciones son peores:
  - Auditar solo UPDATE y DELETE (excepción 4): la cascada, o el upsert del punto 1, escribiría una fila por evento en el historial.
  - Un trigger de sentencia: `auditar()` es por fila, así que haría falta otra función.
  - Sin cascada: o FK `restrict`, que impide la baja física, o `set null`, que genera UPDATE auditados, o sin FK, con huérfanos.

  Como la excepción se apoya en «solo escribe la RPC», conviene un `has_table_privilege` que fije que `anon` y `authenticated` no tienen INSERT,
  UPDATE ni DELETE.
- **RPC en una sentencia (ataque 2): está bien así.**
  - Es atómica, porque es una sola sentencia y una sola transacción.
  - El CTE de escritura se ejecuta siempre.
  - El `update` toma el lock de la fila de `normativa`, así que dos llamadas a la misma normativa se serializan igual que hoy. Ese lock también
    ordena el upsert del día. El chequeo de la FK (KEY SHARE) es compatible con el lock propio.
  - El `WHEN` de 0017 se sigue cumpliendo: el UPDATE solo cambia `descargas`, y el test de «no audita ni toca `updated_at`» de
    `normativas.test.sql` lo sigue cubriendo.
  - Puede seguir en `language sql`.
- **Conservar `normativa.descargas` (ataque 3): está bien así.** Los dos valores suben en la misma sentencia. La diferencia entre ellos es una
  constante (el histórico sin fecha) y solo cambia por un rol con bypass. Sacar el contador obligaría a guardar esa línea de base en una columna
  aparte, que es más cambio. Conviene un pgTAP del invariante: N llamadas anónimas suben N las dos cosas, y el admin no sube ninguna.
- **No deduplicar (ataque 5)** es coherente con 0030 («se protegen las métricas») mientras el abuso cueste solo números, que es lo que
  asegura el punto 1.
- El orden de CA 5 y que fallar una consulta haga fallar todo el `Promise.all` (CA 8): coinciden con 0024 y con el tablero actual.
- `useMetricas`, la clave `['dashboard', desde, hasta]` y el KPI «Normativas» quedan igual: correcto.
- **Simplicidad (ataque 8):** la versión más chica es la de los puntos 1 y 2: una tabla diaria con la PK como único índice y una RPC que
  devuelve la fila completa. En el cliente queda reemplazar un `from` por un `rpc`, el tipo derivado, el orden nuevo y una columna. Es menos
  código que la spec, porque no hay unión, ni secuencia, ni filtro con zona horaria en la lectura.

## Respuesta

1. **Acepto (alta) (*).** La tabla pasa a `descarga_normativa_dia (normativa_id, dia, descargas)`, PK `(normativa_id, dia)`, `on delete cascade`, con upsert en la misma sentencia que el `update`. El día es el local de Argentina, resuelto al escribir. Con esto «sin tope por IP» deja de crecer la base. Cambia la forma de lo que el usuario llamó «eventos»: el período sigue siendo exacto por día, pero se pierde la hora, que nadie pidió.
2. **Acepto (media).** `metricas_normativas` devuelve `id, titulo, numero, anio, descargas, descargas_periodo` y se borra el `from('normativa')` de `consultas.ts`. Un solo snapshot y tipos derivados en snake_case.
3. **Acepto (media).** Se agrega el `grant select` a `authenticated` y un pgTAP donde el admin lee filas.
4. **Acepto (media).** La spec nombra los tests que se tocan (`metricas.test.sql`, `consultas.test.ts`, `DashboardPage.test.tsx`, `e2e/dashboard.spec.ts`, `no-contar-admin.spec.ts`, `normativas.test.sql`, `auditoria_global`, `entidades.ts`), fija que «Total histórico» queda como última columna y corrige la ruta de `DashboardPage.tsx` (`src/pages/admin/`).
5. **Rechazo (baja).** Se queda el `perform` sobre `metricas_registros`, que es el molde de 0024; separar la validación del período toca una función existente por una lectura de más que el volumen tolera.
6. **Acepto por reemplazo (baja).** Con el punto 1 la PK ya cubre la cascada.
7. **Acepto (baja).** La verificación crea una normativa desde el panel y el borrado en cascada se comprueba con un pgTAP.
8. **Acepto (baja).** El aviso reemplaza la descripción actual y no repite «Total histórico». La justificación de la spec se corrige: la base podría conocer la fecha, pero no vale guardarla.

(*) Cambia el diseño respecto de lo que se habló con el usuario: se le muestra.

# Crítica del código

Revisé el diff sin commitear de `feat/descargas-normativas-periodo`: la migración `20261113120000_descarga_normativa.sql`,
`descarga_normativa.test.sql` y los cambios en `normativas`, `metricas` y `auditoria_global`, `features/dashboard/*`, `DashboardPage.tsx` y su
test, `historial/entidades.ts` y los docs. No pude correr pgTAP, Vitest ni typecheck (el hook de mi perfil los bloquea): lo que digo de
Postgres sale de leer el código y la documentación.

## Veredicto
Hay mejoras

Si solo se cambia una cosa: sacar `descarga_normativa_dia` del mapa del historial con el mismo `Exclude` que ya usa `intento_descarga`, en
lugar de sumarla a la entidad «Descarga».

## Puntos

1. **`descarga_normativa_dia` entra en el filtro «Descarga» del historial, cuando el precedente es excluirla del tipo** (baja)
   - Evidencia: `src/features/historial/entidades.ts`:5-6 ya excluye `intento_descarga` de `TablaAuditada` por la misma razón («contador sin
     auditar, nunca aparece en él»); :18-19 y :36-37 en cambio la mapean a `DESCARGA` con `filtrable: true`. Así, `tablasDeEntidad('descarga')`
     pasa a ser `['registro_descarga', 'descarga_normativa_dia']`, y el filtro manda `.in('tabla', [...])` (`consultas.ts`:26) con una tabla que
     nunca tiene filas en `registro_operacion`. También queda la etiqueta «Descarga» como si las de normativas se auditaran.
   - Respuesta a la pregunta del pedido: el filtro funciona igual (la tabla de más no suma filas), pero dice algo falso. Hoy «Descarga» en el
     historial son las vinculaciones de `registro_descarga` (UPDATE de `vincular_institucion`), que son descargas de talleres.
   - Alternativa: `Exclude<..., 'registro_operacion' | 'intento_descarga' | 'descarga_normativa_dia'>`, con el comentario de :5 ampliado.
     `registro_descarga` vuelve a su literal y se borran la constante `DESCARGA` y la fila nueva de `entidades.test.ts`:44. La spec decía
     «suma `descarga_normativa_dia`» (spec.md:29), pero el argumento nuevo es el precedente de `intento_descarga`, que la spec no vio.
     De paso, la fila `historial` de `docs/arquitectura.md` sigue diciendo `Exclude<keyof Tables, 'registro_operacion'>`: ya estaba
     desactualizada.
   - Qué se gana: un solo criterio para las tablas sin auditar, ninguna entidad que diga más de lo que hay, y una constante y un test menos.

2. **`descargas default 0` es un valor que nunca es correcto, y el test lo fija como contrato** (baja)
   - Evidencia: migración :9 (`default 0`) y :44-45 (el `insert` pasa `1` explícito, que es el arreglo del bug de la spec);
     `descarga_normativa.test.sql`:56 (`col_default_is ... '0'`).
   - Problema: el arreglo deja el invariante bien, pero el default sigue invitando a repetir el bug. Cualquier `insert` futuro que omita la
     columna (otra RPC, un script de carga, un `create or replace` de esta) crea una fila en 0 y el día queda una descarga corto respecto del
     contador, sin que nada lo detecte. Una fila con 0 no tiene sentido en esta tabla: existe porque hubo al menos una descarga.
   - Alternativa: `descargas int not null check (descargas > 0)` sin default (un `insert` sin la columna falla por `not null`), o
     `default 1 check (descargas > 0)`, como proponía el punto 1 de la crítica de la spec. Se cambia el `col_default_is` por un `throws_ok`
     de `23514` o `23502`, como postgres, con un insert que la omita o pase 0. La migración todavía no está commiteada, así que se puede
     editar.
   - Qué se gana: el invariante «contador == suma de los días» lo sostiene la tabla y no la memoria de quien escriba el próximo `insert`.

3. **Los e2e que la spec nombra no se tocaron: pasan, pero no prueban «En el período»** (baja; es trabajo de `qa`)
   - Evidencia: `e2e/dashboard.spec.ts`:154-155 y `e2e/no-contar-admin.spec.ts`:23-24 no están en el diff; spec.md:30 los lista.
   - Estado: siguen pasando. La descripción ya no contiene «Total histórico», así que `getByText` encuentra solo el encabezado, y `cell().last()`
     sigue siendo el total. Pero ninguno lee la columna nueva.
   - Alternativa, para la fase de QA: en `dashboard.spec.ts`, cambiar :154 a `getByRole('columnheader', { name: 'Total histórico' })` y
     verificar `cell().nth(-2)` = 1 después de la descarga anónima. En `no-contar-admin.spec.ts`, leer también la penúltima celda y exigir que no
     cambie.
   - Qué se gana: la única prueba del camino entero (cliente → RPC → tabla → `metricas_normativas` → celda) que la spec pidió.

4. **El test nuevo cita un documento que no existe** (baja)
   - Evidencia: `descarga_normativa.test.sql`:23-24 («Ver duda en el informe de la fase RED»).
   - Alternativa: borrar la frase o escribir la duda ahí mismo. Por lo que dice :23, ya está resuelta: RLS da 0 filas y no `42501`, como
     fija el CA 7.
   - Qué se gana: el test no apunta a una conversación que nadie más va a ver.

## Revisado sin cambios

- **Invariante en la segunda descarga del día y bajo concurrencia: se cumple.**
  - El `update` de la CTE toma el lock de la fila de `normativa`. Dos llamadas a la misma normativa se serializan: la segunda espera, se
    reevalúa en READ COMMITTED y suma sobre el valor confirmado.
  - El upsert usa `on conflict do update`, que en READ COMMITTED garantiza insertar o actualizar aun si la fila del día la creó otra
    transacción recién confirmada. Con el lock anterior, eso además nunca llega a competir.
  - El `1` explícito (migración :45) arregla el bug de la spec. La segunda llamada entra por el `do update` y suma 1. Lo cubren
    `descarga_normativa.test.sql`:155-160 (tres llamadas: 3, 3 y una sola fila) y `normativas.test.sql`:555-560 (2 y 2).
  - `now()` es el de la transacción, el mismo para las dos mitades. Una descarga a las 23:59:59 no puede caer en un día en el contador y en
    otro en la tabla, porque el contador no tiene día.
  - Con un `delete` concurrente de la normativa, o el `update` no encuentra la fila y no inserta nada, o el `delete` espera al lock y la
    cascada borra el día. No queda ningún conteo huérfano.
- **El `WHEN` de 0017:** el `update` sigue tocando solo `descargas`, así que ni `auditar()` ni `tocar_updated_at()` corren. Lo fija
  `descarga_normativa.test.sql`:174-177, además del test que ya existía en `normativas.test.sql`.
- **Seguridad:**
  - `contar_descarga_normativa` repite `security definer` y `search_path = ''`, y todas las referencias van calificadas con `public.`
    (`es_admin` incluido).
  - `create or replace` conserva los grants, y :100-103 lo fija.
  - La escritura en la tabla nueva pasa solo por el dueño. `revoke all` y el `grant select` a `authenticated` (:17-18) son el molde de
    `registro_descarga`, y los `has_table_privilege` de :70-83 fijan que no hay escritura para nadie de la API.
  - `metricas_normativas` es invoker, tiene EXECUTE solo para `authenticated` (con `revoke` de `public` y `anon`) y `search_path` vacío.
- **`metricas_normativas`:**
  - El período va en el `on` del `left join` y la suma lleva `coalesce(...)::bigint`, así que las normativas sin descargas aparecen con 0. El
    test :246-250 lo distingue de un filtro en el `where`.
  - Las columnas son las de `normativa`, y :225-230 fija el contrato.
  - No hay columnas sin calificar que choquen con los parámetros OUT del `returns table`.
  - La PK `(normativa_id, dia)` sirve para el join por rango.
  - El `perform` quedó rechazado en la `## Respuesta` (5) y no lo reabro.
- **Día en hora de Argentina:** se calcula una vez, al escribir, con la misma expresión de «hoy» que `metricas_registros`. Los tests con la
  sesión en UTC+14 y UTC-11 (:145-170) son lo mejor que se puede probar sin un reloj inyectable, y la nota de :17-21 lo explica bien.
- **Cliente:**
  - `consultas.ts` cambia un `from` por un `rpc`, `NormativaConteo` sale de `Returns[number]` y `ordenarNormativas` aplica el orden del CA 5.
  - `TablaNormativas` deja «Total histórico» como última columna.
  - El aviso reemplaza la descripción, no repite «Total histórico», y su test lo fija con `getAllByText(...).toHaveLength(1)`.
  - El KPI, `useMetricas` y la clave no cambian.
  - En `consultas.test.ts`, el mock de `from` queda solo para afirmar que no se llama, y está bien así.
- **Guardias:** `auditoria_global` tiene la excepción (28) con su motivo. `metricas.test.sql` suma la función a la lista exacta, al contrato de
  firmas y a los bucles de `42501` y `22023`.
- **Docs:** 0017 lleva una nota que no reabre la decisión. `definicion-dam.md` y las brechas de `arquitectura.md` quedan al día.

## Respuesta (crítica del código, junto con `revision.md`)

1. **Acepto (baja).** `descarga_normativa_dia` va al `Exclude` de `TablaAuditada` como `intento_descarga` (nunca tiene filas en el historial); `registro_descarga` vuelve a su literal, se borra la constante `DESCARGA` y la fila de `entidades.test.ts`. Cambia lo que decía la spec («suma `descarga_normativa_dia`»): el argumento nuevo es el precedente. Se corrige también la fila `historial` de `arquitectura.md`.
2. **Acepto (baja).** `descargas int not null check (descargas > 0)` sin default; el test pasa de `col_default_is '0'` a un `throws_ok` (`23502`/`23514`). La migración no está commiteada, se edita.
3. **A `qa` (baja).** Los dos e2e se ajustan en esa fase: `columnheader` «Total histórico» y la penúltima celda («En el período»).
4. **Acepto (trivial).** Se borra la frase «Ver duda en el informe de la fase RED».
5. **Acepto (importante, revisor).** El test de la cascada borra como admin (`lives_ok` con claims) y después `is_empty` de sus conteos; se reacomodan los conteos de los bloques siguientes.
6. **No hago nada (observación).** `service_role` con EXECUTE de `metricas_normativas` es igual a las otras siete `metricas_*` y sin la marca da `42501`; la redacción «solo `authenticated`» de la spec se lee como «de la API».
7. **Sin cambios.** Build y `database.ts` regenerado los verifico yo.
