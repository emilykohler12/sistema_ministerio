# Revisión 1

Diff sin commitear de `feat/descargas-normativas-periodo` contra `main` (cf17073), incluidos los archivos nuevos
(`20261113120000_descarga_normativa.sql`, `descarga_normativa.test.sql`, `TablaNormativas.test.tsx`), contra `spec.md` (aprobada).

## Veredicto
Cambios necesarios

Un solo punto, chico: el criterio 6 tiene test, pero no con el actor real.

## Problemas

- **[importante]** `supabase/tests/descarga_normativa.test.sql:110-121`: la baja que prueba la cascada (criterio 6) corre como `postgres`,
  antes de poner claims. En la app, quien borra una normativa es `authenticated` con la marca, y ese rol **no tiene DELETE** sobre
  `descarga_normativa_dia` (`revoke all`, migración :17) y la RLS no tiene política de delete. Según la semántica de Postgres, la acción referencial
  corre como dueño de la tabla que referencia y sin RLS, así que debería andar. Pero el test pasa igual si eso no fuera cierto: un cambio futuro
  (FK sin cascada, `force row level security`, otro dueño) dejaría al admin sin poder borrar ninguna normativa descargada, y ningún test se pondría
  rojo. La única baja de admin en `normativas.test.sql:581` borra una normativa sin conteos diarios. La spec (verificación, paso 5) delega este caso al
  pgTAP, y la crítica de la spec (punto 7) pedía hacerlo como `authenticated` con la marca.
  — Arreglo: en el bloque admin de `descarga_normativa.test.sql` (o con claims de admin alrededor del `delete` actual), borrar `DN Borrar` como
  `authenticated` con `app_metadata.admin` con `lives_ok` y después verificar con `is_empty` que no quedan sus conteos. El `dn_borrar` temporal y los
  asserts siguientes se pueden reutilizar; ojo con el `count = 4` de `DN A` y el `count = 6` del admin, que dependen de en qué momento se borra.

## Observaciones (no bloquean)

- `metricas_normativas` revoca EXECUTE a `public` y `anon`, pero `service_role` lo conserva (migración :79). La spec dice «EXECUTE solo
  `authenticated`». Es igual que las otras siete `metricas_*` y no se puede explotar (sin la marca da `42501`). Es la quinta vez que aparece en el
  proyecto: conviene decidir la redacción de una vez (o «solo authenticated de la API», o revocar `service_role` en toda la familia).
- Las cuatro observaciones de la «Crítica del código» (`critica.md`) no tienen `## Respuesta`. Ninguna afecta la corrección hoy:
  - `default 0` con el `1` explícito en el insert: el invariante se cumple y lo fijan `descarga_normativa.test.sql:155-160` y `normativas.test.sql:379-384`.
  - `descarga_normativa_dia` en la entidad «Descarga» del historial: el filtro manda una tabla de más en `.in('tabla')`, pero esa tabla nunca tiene filas.
  - Los e2e: quedan para qa.
  - La frase «Ver duda en el informe de la fase RED» (`descarga_normativa.test.sql:24`) apunta a un documento que no existe.

  Que el agente principal las responda antes del commit.

## Desvíos reportados por el implementador

1. **Insert con `descargas = 1` explícito en el upsert** (migración :44-45). Es correcto y necesario. La sentencia de la spec (spec.md:24) insertaba
   sin la columna y, con `default 0`, la primera descarga del día habría quedado en 0, un conteo corto respecto del contador. Lo cubre el test de
   tres llamadas → `(3, 3, 1)`.
2. **`DESCARGA` compartida en `entidades.ts`**. Sigue lo que pide la spec (spec.md:28: «suma `descarga_normativa_dia`»). Funciona: el mapa
   sigue siendo exhaustivo y `entidades.test.ts:44` lo fija. Ver la observación de la crítica.
3. **Texto del aviso** (`DashboardPage.tsx:425`): «Las descargas anteriores a que se registrara el día no entran en «En el período»: solo suman al
   acumulado de la última columna.» Cumple el criterio 4: reemplaza la descripción, dice que las anteriores no tienen día y no repite «Total
   histórico». Lo fija `DashboardPage.test.tsx` con `getAllByText(/Total histórico/i).toHaveLength(1)`.

## Verificado sin problemas

- **Criterio 1**: el `update` y el upsert van en una sentencia (`language sql`, CTE). El día es `(now() at time zone 'America/Argentina/Buenos_Aires')::date`,
  la misma expresión de «hoy» que `metricas_registros`. Tests: N llamadas → contador N, conteo N, una sola fila. La zona de la sesión en UTC+14 y UTC-11
  no cambia el día. Tampoco se toca `updated_at` ni `registro_operacion` (el `WHEN` de 0017 sigue valiendo). El cliente de normativas no cambia:
  no hay diff en `src/features/normativas/`.
- **Criterio 2**: con el mismo `sub`, sin la marca cuenta y con la marca no cuenta, en `descarga_normativa.test.sql:196` y :216-222 y en
  `normativas.test.sql:375-384` y :413-420. Un id inexistente no deja filas (el `count = 6`). La función sigue `security definer`, con `search_path`
  vacío y EXECUTE para `anon` y `authenticated`, y los tests lo fijan.
- **Criterio 3**: `consultas.ts` reemplaza el `from('normativa')` por `rpc('metricas_normativas', args)` (siete RPC). `NormativaConteo` sale de
  `Returns[number]`. «Total histórico» es la última columna (`TablaNormativas.test.tsx` y `DashboardPage.test.tsx` fijan los encabezados y las celdas).
  `useMetricas` y la clave no cambian.
- **Criterio 5**: `coalesce(sum(...), 0)::bigint` y el período en el `on` del `left join`. El pgTAP distingue un filtro en el `where`: `DN B` y `DN C`
  aparecen con 0. También prueba los bordes inclusivos y los días fuera del período. El orden `período desc, total desc, id asc` tiene datos que
  ejercen cada clave por separado (`calculos.test.ts` y `TablaNormativas.test.tsx`: los empates de período se resuelven por total y los de total, por id).
- **Criterio 6**: FK `on delete cascade`. La cascada borra y no toca las demás normativas ni deja filas en `registro_operacion` (con el problema de
  arriba sobre el rol).
- **Criterio 7**: `anon` → `42501` al leer, insertar, actualizar o borrar y en `metricas_normativas`. Sin la marca: 0 filas con 6 existentes (no es
  vacuo), `42501` al escribir y en la RPC, también con `(null, null)`, que prueba que `es_admin()` va antes que el `22023`. El admin lee las 6 filas y no
  puede escribir. Período inválido → `22023` en cinco casos. `has_table_privilege` fija que no hay INSERT, UPDATE ni DELETE para `anon` ni
  `authenticated`, y que no hay políticas de escritura.
- **Criterio 8**: `it.each(Object.keys(porRpc))` cubre `{ error }` y el rechazo de `metricas_normativas`. Los dos tests borrados eran del `select`
  que ya no existe: no es un debilitamiento.
- **RLS y guardias**: RLS en la misma migración. `revoke all` + `grant select` a `authenticated` (molde de `registro_descarga`) y política de select
  `to authenticated` con `(select public.es_admin())`. Excepción de los tres eventos (28) en `auditoria_global` con su motivo. `metricas.test.sql`
  suma la función a la lista exacta, al contrato de firmas con `pg_get_function_result` y a los bucles de `42501` y `22023`. `descarga_normativa.test.sql`
  fija la firma con `pg_get_function_result` y con `proargnames` (una columna extra no pasa).
- **`metricas_normativas`**: invoker, `search_path` vacío, `perform` sobre `metricas_registros` (molde de 0024, respuesta 5 de la crítica). Las
  columnas van calificadas, así que no chocan con los parámetros OUT. Los tipos son los de `normativa`.
- **Concurrencia**: el `update` toma el lock de la fila de `normativa` y serializa las llamadas a la misma normativa. `on conflict do update`
  cubre el alta concurrente del día.
- **Tests no debilitados**: los asserts de `normativas.test.sql` que pasaban con cualquier implementación ahora exigen el conteo diario. Los
  cambios de `DashboardPage.test.tsx` endurecen el assert (encabezados y celdas exactas en lugar de `getByText`).
- **Docs**: `arquitectura.md` (dominios normativas y dashboard, migración, brechas), `definicion-dam.md:240` y la nota de 0017 coinciden con el código.
  La fila de `historial` sigue diciendo `Exclude<keyof Tables, 'registro_operacion'>`, que ya estaba desactualizada antes de este cambio.
- **Alcance**: no hay cambios fuera de lo que lista la spec (más la memoria del crítico). `database.ts` tiene la forma de un archivo generado
  (no pude correr `gen types` para compararlo: lo bloquea el perfil del revisor; el typecheck pasa).
- Los e2e `dashboard.spec.ts` y `no-contar-admin.spec.ts` quedan para qa, como se avisó. No se cuentan como hallazgo.

## Evidencia

- `npm run test:db`: `Files=24, Tests=902 … Result: PASS` (incluye `descarga_normativa.test.sql`, 72 asserts, y `normativas.test.sql`, 115).
- `npm run lint` (oxlint): 0 errores y 3 warnings previos, en archivos que este cambio no toca (`AuthContext.tsx:74`, `DescargaModal.tsx:133`,
  `TallerFormPage.tsx:117`).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: `Tests 1925 passed (1925)`.
- `npm run build`: no lo pude correr (lo bloquea el perfil del revisor).
