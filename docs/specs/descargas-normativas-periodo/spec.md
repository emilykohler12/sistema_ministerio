# Descargas de normativas por período

- **Estado:** aprobada
- **Autor:** Emily Kohler + Claude
- **Fecha:** 2026-11-13 (issue #32)

## Objetivo
El dashboard muestra por normativa solo el contador acumulado. El admin quiere ver cuántas descargas tuvo cada normativa en el período que elige (el mismo selector de 30 días, año o rango), junto al total histórico.

## Criterios de aceptación
1. Dado un visitante anónimo, cuando descarga una normativa por primera vez en su visita, entonces `normativa.descargas` sube 1 y el conteo de ese día (local de Argentina) para esa normativa sube 1, en la misma sentencia. El cliente no cambia.
2. Dado un admin con sesión, o un id inexistente, cuando se llama a `contar_descarga_normativa`, entonces no cambia nada y la RPC responde bien (como hoy, #25).
3. Dado un período válido, cuando el admin abre el dashboard, entonces la sección «Normativas» muestra por fila «En el período» (suma de los días dentro de `[desde, hasta]`) y, como última columna, «Total histórico» (el contador). Al cambiar el período solo cambia «En el período».
4. Dado que las descargas anteriores a esta feature no tienen día, entonces no entran en «En el período», y un aviso que reemplaza la descripción actual de la sección lo dice (sin repetir «Total histórico»).
5. Dada una normativa sin descargas en el período, entonces aparece con 0. Orden: «En el período» desc, «Total histórico» desc, `id` asc.
6. Dado que se borra una normativa, entonces se borran sus conteos diarios con ella.
7. Dado un visitante anónimo o un usuario sin la marca de admin, cuando intenta leer la tabla, entonces `anon` recibe `42501` y un usuario sin la marca ve 0 filas (RLS); ninguno puede escribirla (`42501`) y llamar a `metricas_normativas` da `42501`. El admin lee filas. Un período inválido da `22023`, como las demás `metricas_*`.
8. Si falla la consulta, falla todo el dashboard como hoy (`Promise.all`), con su «Reintentar».

## Diseño
- **Migración nueva** `*_descarga_normativa.sql`:
  - Tabla `descarga_normativa_dia (normativa_id int not null references normativa(id) on delete cascade, dia date not null, descargas int not null default 0, primary key (normativa_id, dia))`, sin `updated_at`. Un conteo por normativa y día en lugar de una fila por llamada: la base no crece con el abuso de un endpoint anónimo (límite del crítico). RLS: select solo `es_admin()`, `revoke all` a `anon` y `authenticated` y después `grant select` a `authenticated`; sin políticas ni grants de escritura.
  - Sin `auditar()`: es un hecho anónimo (0022) y la cascada llenaría el historial; la baja de la normativa ya queda auditada. Excepción de los tres eventos en `auditoria_global.test.sql`, con comentario, y un pgTAP con `has_table_privilege` que fija que `anon` y `authenticated` no tienen INSERT, UPDATE ni DELETE.
  - `contar_descarga_normativa` (`create or replace`, misma firma, `security definer`, `search_path=''`, `language sql`): una sentencia, `with u as (update normativa set descargas = descargas + 1 where id = p_id and not (select public.es_admin()) returning id) insert into descarga_normativa_dia (normativa_id, dia) select id, (now() at time zone 'America/Argentina/Buenos_Aires')::date from u on conflict (normativa_id, dia) do update set descargas = descarga_normativa_dia.descargas + 1`.
  - `metricas_normativas(p_desde, p_hasta) returns table (id int, titulo varchar, numero ..., anio ..., descargas int, descargas_periodo bigint)` (`security invoker`, `search_path=''`, EXECUTE solo `authenticated`): `perform` sobre `metricas_registros` para heredar `42501` y `22023` (molde de 0024), `left join` con el período en el `on` y `coalesce` a 0; una fila por normativa. Los tipos de las columnas son los de `normativa`.
- `src/shared/types/database.ts`: se regenera con `npm run db:types`.
- `features/dashboard`: `consultas.ts` reemplaza el `from('normativa')` por la RPC (queda con siete llamadas); `types.ts` deriva `NormativaConteo` de `Returns` (snake_case); `calculos.ts` (`ordenarNormativas`); `components/TablaNormativas.tsx` (columnas «En el período» y «Total histórico», esta última), y `src/pages/admin/DashboardPage.tsx` (aviso en lugar de la descripción). El KPI «Normativas» (cantidad) no cambia. `useMetricas` y la clave `['dashboard', desde, hasta]` no cambian.
- `features/historial/entidades.ts`: el mapa tabla → entidad es exhaustivo, suma `descarga_normativa_dia`.
- **Tests que se tocan:** `supabase/tests/metricas.test.sql` (hoy «exactamente siete `metricas_*`» y el contrato de firmas), `normativas.test.sql` (l.299-307 y 402, que pasan con cualquier implementación: se amplían para verificar el conteo diario), `auditoria_global.test.sql`, `consultas.test.ts` del dashboard (el `select` exacto y «seis llamadas»), `DashboardPage.test.tsx` (l.512 busca «Total histórico»), `e2e/dashboard.spec.ts` (l.154-155) y `e2e/no-contar-admin.spec.ts` (leen la última celda). pgTAP nuevos: invariante (N llamadas anónimas suben N el contador y el conteo del día; el admin ninguno), día en hora de Argentina cerca de la medianoche, ceros, `42501`/`22023`, el admin lee filas y borrar una normativa borra sus conteos.
- Docs: `docs/arquitectura.md` (dominios dashboard y normativas, migraciones, brechas), `docs/definicion-dam.md` (l.240) y nota en 0017. Sin ADR nuevo; se ofrece `/decision` al cerrar.
- **Decisiones de la entrevista:** total histórico + período; sin tope por IP; datos borrados con la normativa; columna por normativa, sin serie diaria en pantalla.

## Fuera de alcance
- Serie diaria o por mes en pantalla (la tabla ya la permite) y exportar.
- Tope por IP para normativas (0030, depende de #54) y deduplicar por visitante: un script puede inflar los números, pero ya no la base.
- Reconstruir el día de las descargas anteriores a la migración, y la hora de cada descarga.
- Mostrar en el aviso la fecha de inicio: la base podría conocerla, pero no vale guardarla.
- Cambiar el cliente de descarga o las descargas de talleres.

## Verificación de punta a punta
1. `npm run db:reset`; no hay normativas de semilla, así que crear una desde el panel. En el dashboard: «En el período» 0 y «Total histórico» 0.
2. Como anónimo, descargar esa normativa: tras recargar el dashboard, ambas columnas suben 1; descargarla otra vez en la misma visita no cambia nada.
3. Como admin, abrir la normativa: nada cambia.
4. Cambiar el período a uno que no incluya hoy: «En el período» vuelve a 0 y «Total histórico» no cambia.
5. Borrar la normativa desde el panel: sale del dashboard (sus conteos se comprueban con el pgTAP).
6. `npm test`, `lint`, `typecheck`, `npm run test:db`, `npm run test:e2e`; después `npm run db:reset`.
