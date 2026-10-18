# Tablero de métricas (corte dashboard)

- **Estado:** aprobada (crítica respondida en `critica.md`)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-16

## Objetivo
El administrador ve en `/admin` las métricas de §5.4 calculadas en la base, sobre `registro_descarga`, y filtradas por período.
Con esto se migra el último dominio que quedaba con mocks (0012). Los indicadores de §5.4 siguen sin validar (C-11). Por eso cada uno se implementa por separado, para que cambiar uno no arrastre a los demás.

## Criterios de aceptación
1. **Período.**
   - El `ToggleGroup` ofrece "Últimos 30 días" (`[hoy-29, hoy]`, por defecto), "Año en curso" (`[1 de enero, hoy]`) y "Rango". "Rango" muestra dos `<input type="date">`.
   - "Hoy" es la fecha en hora de Argentina (`Intl`), no `toISOString()`.
   - El período vive en la URL: `?periodo=30d|anio|rango&desde=AAAA-MM-DD&hasta=AAAA-MM-DD`. Si el valor es inválido, se usan los 30 días.
   - El rango se valida: `2020-01-01 <= desde <= hasta <= hoy`. Si no cumple, se muestra un error junto a los campos y no se consulta: no hay skeletons ni datos viejos.
   - Al cambiar un período válido se mantienen los datos anteriores hasta que llegan los nuevos (`keepPreviousData`).
   - Los campos del rango pasan a la URL (`replace`) 300 ms después de la última edición, para no consultar fechas a medio tipear. Este desvío se acordó en la implementación.
2. **Resumen.**
   - Con período: descargas y establecimientos alcanzados (`establecimiento_id` distintos y no nulos).
   - Estado actual, sin período: talleres publicados, normativas (`lista.length` de la sección 7) e instituciones "Otra" sin vincular.
   - "Sin vincular" cuenta los pares distintos `(localidad_id, nombre normalizado)` con `establecimiento_id` nulo. El nombre se normaliza sin mayúsculas, tildes ni espacios de los extremos. Se muestra como aviso solo si es mayor que 0, con enlace a `/admin/establecimientos/sin-vincular` (#19).
3. **Descargas en el tiempo.**
   - Se muestran por día si el período tiene 92 días o menos, y por mes si tiene más. Decide `periodo.ts` y lo pasa como `p_por_mes`.
   - Los días o meses sin descargas aparecen en 0.
   - Se muestran en una tabla HTML con una barra CSS por fila, sin recharts (punto 10 de la crítica).
4. **Ranking de talleres.**
   - Incluye los talleres con descargas en el período, sin importar su estado actual. Los que no están publicados llevan un `Badge` con el estado.
   - Orden: descargas desc, luego `id`. Se ven 10 y "Ver todos" despliega el resto.
5. **Por nivel y por cargo.** Muestran cantidad y porcentaje sobre el total del período. Los porcentajes se calculan en el cliente.
   - Nivel: aparecen los 5, también los que están en 0 (`left join nivel_educativo`). Se calcula por la categoría *actual* del taller.
   - Cargo: aparecen solo los cargos con descargas. "Otro" se agrupa sin detallar `cargo_otro`.
   - Sin descargas, se muestra un estado vacío.
6. **Por localidad.** Para cada una de las 79: descargas (por `registro_descarga.localidad_id`), alcanzados, padrón y cobertura.
   - Alcanzados son los `establecimiento_id` distintos y **activos** del período, atribuidos por `establecimiento.localidad_id` y sin filtrar por tipo, para que la vinculación futura cuente.
   - Padrón son los establecimientos activos.
   - Cobertura es `alcanzados ÷ padrón` y se calcula en el cliente. Si el padrón es 0, se muestra "—".
   - Se ven 10 (orden: descargas desc, luego nombre) y "Ver todas" despliega el resto.
7. **Normativas.** Muestran el contador acumulado por normativa (título, número/año, descargas desc), leído con un select directo. No llevan período y la sección lo aclara ("Total histórico").
8. **Estados.**
   - Carga: skeletons.
   - Error: `ErrorFallback` con reintento. Una sola query falla o funciona entera.
   - Sin descargas en el período: los KPIs en 0 y `EmptyState` en las secciones de descargas.
9. **Seguridad (pgTAP).**
   - Un recorrido de `pg_proc` sobre `metricas_%` verifica que cada función sea invoker, tenga `search_path=''` y EXECUTE para `authenticated` y no para `public` ni `anon`. `service_role` conserva los privilegios por defecto (ver `notas.md`).
   - `metricas_registros` lanza `42501` si `not es_admin()` (un error explícito y no ceros silenciosos de la RLS), y `22023` con un período nulo, invertido o fuera de tope.
   - Cada RPC propaga esos errores.
10. **Corrección (pgTAP).**
    - Los bordes se prueban en `metricas_registros`, en hora de Argentina:
      - entran: las 00:00 de `desde` y las 23:59 de `hasta` (las 02:59 UTC del día siguiente);
      - quedan afuera: las 23:59 del día anterior a `desde` y las 00:00 del día siguiente a `hasta`.
    - Cada RPC devuelve los conteos esperados con registros fijos. En particular:
      - un establecimiento inactivo no cuenta como alcanzado en la cobertura;
      - una institución OTRA con `establecimiento_id` sí cuenta.

## Diseño
**Fase A, base** (`supabase/migrations/<ts>_metricas.sql`, `supabase/tests/metricas.test.sql`):
- Índice `registro_descarga_fecha_hora_idx`.
- `metricas_registros(p_desde date, p_hasta date)`: única fuente del período.
  - El filtro es sargable: `fecha_hora >= p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'` y `< (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`.
  - Agrega la columna `dia`, la fecha en hora local.
- Seis RPC `returns table` (las cinco que siguen y la auxiliar), solo con conteos y tipos derivados por typegen:
  - `metricas_resumen`;
  - `metricas_por_periodo(…, p_por_mes)`;
  - `metricas_por_taller`;
  - `metricas_por_nivel`;
  - `metricas_por_cargo`;
  - `metricas_por_localidad`.
- Por qué RPC y no agregar en el cliente:
  - §5.4 lo exige;
  - evita el tope de 1000 filas;
  - no expone registros crudos.

  Van invoker porque la RLS ya es solo admin, y el chequeo explícito da un error claro.

**Fase B, front:**
- `features/dashboard/`:
  - `types.ts`, derivado de `Functions[...]['Returns']`;
  - `periodo.ts`, puro: URL ↔ `{desde, hasta, porMes}`, "hoy" en hora de Argentina y validación;
  - `calculos.ts`, puro: porcentajes y cobertura;
  - `consultas.ts`: las RPC y el select de normativas, en `Promise.all`;
  - `hooks/useMetricas(periodo)`, con clave `['dashboard', desde, hasta]` y `keepPreviousData`.
- Se borran `mocks/` y `useDashboardMetrics`.
- `DashboardPage`:
  - se cambia "Escuelas" por "Establecimientos" y "rol" por "cargo", y el h1 queda igual;
  - nivel, cargo, ranking y localidad pasan a HTML;
  - se quitan los dos gráficos de recharts y se hace `npm uninstall recharts`.
- Componentes nuevos en `features/dashboard/components/`: `SelectorPeriodo`, `SerieDescargas`, `TablaRanking` y `TablaLocalidades`.
- Docs: la fila `dashboard` y las Brechas de `docs/arquitectura.md`, y la fila de Recharts en §8 de `docs/definicion-dam.md`.

## Fuera de alcance
- No contar las descargas del admin (exige cambiar `registrar_descarga`).
- La pantalla de vinculación.
- Exportar a CSV o PDF.
- Las descargas de normativas por período: requieren una tabla de eventos, y esa sería una decisión nueva.
- Comparar contra el período anterior.
- Refresco automático.
- La guardia transversal `funciones_global` (va a `notas.md`).

## Verificación de punta a punta
1. `npm run db:reset` y entrar a `/talleres` en una ventana sin sesión. Descargar **3 talleres distintos**: uno con PADRON, uno con OTRA y uno con cargo "Otro". Descargar también una normativa.
2. En `/admin`:
   - descargas = 3 y 1 establecimiento alcanzado;
   - el aviso "1 institución sin vincular";
   - la serie muestra 3 hoy y el ranking, los 3 talleres;
   - los porcentajes de nivel y de cargo suman ~100 %;
   - la normativa aparece con 1.
3. Pasar a "Rango" con fechas de ayer: los KPIs con período quedan en 0 y aparecen los estados vacíos. La URL cambia y al recargar se conserva. Con `desde > hasta` aparece el error y no hay skeletons.
4. Llamar a una RPC con el token de un usuario autenticado sin admin: `42501`.
