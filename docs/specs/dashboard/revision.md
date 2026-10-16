# Revisión 1: corte dashboard (fases A y B)

- **Fecha:** 2026-10-16
- **Alcance:** `git diff main...HEAD` (fase A commiteada: `20261016120000_metricas.sql`, `metricas.test.sql`, `database.ts`) y el working
  tree sin commitear (fase B: `src/features/dashboard/**`, `DashboardPage` y su test, docs, `package.json` y el lock sin recharts).

## Veredicto
Aprobado

No hay problemas críticos ni importantes. Los diez criterios están implementados y tienen test. Las observaciones de abajo son menores.
Conviene resolver la 1 y la 5 antes del PR porque son baratas.

## Criterios contra la implementación

| # | Implementación | Test |
|---|---|---|
| 1 Período | `periodo.ts` (`hoyArgentina` con `Intl`, `[hoy-29, hoy]`, `[1-ene, hoy]`, fallback a 30 días, `validarPeriodo`) y `SelectorPeriodo` (300 ms, `replace`) | `periodo.test.ts` (bordes de las 21:00, cruce de año y 92/93 días), `DashboardPage.test.tsx` (URL, rango inválido sin skeletons ni consulta, `keepPreviousData`). El `replace` no tiene test (obs. 2) |
| 2 Resumen | `metricas_resumen` y KPI de normativas = `normativas.length`. Aviso singular/plural sin enlace | pgTAP (8/3/3, sin período), página |
| 3 Serie | `metricas_por_periodo` con `generate_series` y truncado sobre `dia`. Tabla HTML con `Barra` | pgTAP (días en 0, mes con el 31/03 22:00), página |
| 4 Ranking | `metricas_por_taller` de cualquier estado y `ordenarTalleres`, `Badge` y "Ver todos" | pgTAP, `calculos.test.ts`, página |
| 5 Nivel/cargo | `left join nivel_educativo` y `group by cargo`. `conPorcentajes` en el cliente | pgTAP, página (33,3 %) |
| 6 Localidad | Alcanzados activos por `establecimiento.localidad_id`, padrón activo y `cobertura` en el cliente ("—" con padrón 0) | pgTAP (B inactivo no cuenta, D vinculada sí cuenta), página |
| 7 Normativas | Select directo y `ordenarNormativas`, "Total histórico" | página |
| 8 Estados | Primero el período inválido, después error, carga y datos. `isPending` y `ErrorFallback` con `refetch` | página (carga, error y reintento, sin descargas) |
| 9 Seguridad | Las 7 funciones son invoker, con `search_path=''`, `revoke ... from public, anon` y `grant ... to authenticated`. El 42501 va antes que el 22023 | recorrido de `pg_proc`, loops 42501 (7/7), 22023 (7 llamadas, 6 RPC) y anon (7/7) |
| 10 Corrección | Filtro sargable `>= desde::timestamp at time zone AR` y `< (hasta+1)::timestamp at time zone AR` | pgTAP: 2 bordes que entran y 2 que quedan afuera, más `desde = hasta` y `dia` local |

Otras verificaciones:
- **Seguridad.** No hay secretos ni service role en el frontend. Solo `metricas_registros` devuelve filas crudas, y solo al admin, que ya tiene SELECT sobre
  la tabla: anon no tiene EXECUTE y un authenticated sin la marca recibe `42501`. No expone `cargo_otro`.
- **Propagación.** El `perform 1 ... limit 1` corre la auxiliar completa: la SRF plpgsql se materializa. Por eso el 42501 y el 22023 llegan también
  cuando el `generate_series` o el join quedarían vacíos.
- **Reglas.** Se cumplen `rules/datos.md` (`{ error }` y rechazo testeados por RPC y por select, `consultas.test.ts` con el query builder mockeado,
  sin imports entre dominios: `ETIQUETA_ESTADO` lo pasa la página) y `rules/react.md` (`isPending`, rama de error con test, `aria-describedby`
  hacia el `FieldError` en los dos `<input type="date">`, keys por id).
- **Accesibilidad.** Las secciones son `region` con nombre (`aria-labelledby` al `h2`) y las tablas tienen `th`. `Barra` lleva `aria-hidden`, con el
  valor escrito en otra celda. El skeleton es `role="status"` y "Ver todos" tiene `aria-expanded`.
- **Test 7 corregido** (`metricas.test.sql:149`). `pg_get_function_identity_arguments` fija los nombres, los tipos y el orden de los parámetros de entrada de las 6
  RPC, y eso alcanza para la firma. Se perdió una parte (obs. 1): con `proargnames` también se fijaban las columnas de salida.
- **recharts.** No queda ninguna referencia en `src/` ni en `package.json`. En el lock solo se fueron recharts y sus dependencias transitivas (d3-*,
  redux, immer, etc.).

## Problemas

- **[menor]** `supabase/tests/metricas.test.sql:149-155`: con el cambio a `pg_get_function_identity_arguments`, el test dejó de fijar las columnas
  de salida de `metricas_por_periodo`, `_por_taller`, `_por_nivel`, `_por_cargo` y `_por_localidad`. Los tests de agregación las seleccionan por
  nombre, así que renombrar o quitar una columna se detecta. **Agregar una columna no**: por ejemplo, `institucion_otra` en `metricas_por_taller` pasaría
  verde, y el contrato dice "solo conteos". `metricas_resumen` y `metricas_registros` sí tienen la lista completa (líneas 157 y 231). **Arreglo:** sumar
  `pg_get_function_result(oid)` al mismo `results_eq` (por ejemplo, `'TABLE(inicio date, descargas bigint)'`). Fija nombres y tipos de salida
  sin tocar la migración.
- **[menor]** `src/features/dashboard/components/SelectorPeriodo.tsx:42` y `DashboardPage.tsx`: ningún test verifica el `replace` del último punto del
  criterio 1. Si se vuelve a `push`, todo sigue verde. El debounce sí está cubierto de forma indirecta: el test de `DashboardPage.test.tsx:192` fallaría sin él,
  porque el rango intermedio `2026-03-12..hoy` es válido y dispararía una consulta. **Arreglo:** en `Ubicacion`, exponer `useNavigationType()` y
  esperar `'REPLACE'` después de editar una fecha (y `'PUSH'` al elegir un preajuste).
- **[menor]** `supabase/migrations/20261016120000_metricas.sql:225-231`: `service_role` conserva el EXECUTE de los privilegios por defecto de Supabase.
  El criterio 9 dice "EXECUTE solo para `authenticated`" y el test solo mira `public` y `anon`. No es explotable: el JWT de service_role no trae
  `app_metadata.admin` y la función da `42501`. **Arreglo:** decidir si la spec quiere decir "ni public ni anon" (y dejarlo así) o sumar
  `service_role` al `revoke` en una migración nueva. Es el mismo olvido de cortes anteriores (`guardar_taller`).
- **[menor]** `src/features/dashboard/periodo.ts:115` y `metricas.sql:38`: "hoy" se calcula en dos relojes. Si el reloj del equipo del admin está
  adelantado respecto del servidor, en la ventana anterior a la medianoche del servidor el período por defecto manda `hasta` = mañana. La base
  responde `22023`, se ve `ErrorFallback` y "Reintentar" repite el error hasta que el servidor cambia de día. Para un desfase de segundos la ventana es
  despreciable. Con un reloj mal configurado (horas), el tablero falla todas las noches. **Arreglo:** aceptarlo y anotarlo en `notas.md`, o que el
  servidor tolere `hasta = hoy + 1` y lo recorte.
- **[menor]** Docs:
  - En `docs/arquitectura.md`, la sección "Base de datos" no lista `migrations/<ts>_metricas.sql` (índice, auxiliar y seis RPC invoker solo para
    authenticated).
  - En Brechas sigue "Mejoras del dashboard (definición §5.4)" (línea 118) sin decir qué falta: C-11, comparar contra el período anterior,
    exportar y no contar las descargas del admin.
  - No existe `docs/specs/dashboard/notas.md`. La spec manda ahí la guardia `funciones_global` (Fuera de alcance) y es donde se registran el desvío de
    los 300 ms y la decisión de mostrar la tabla por localidad sin descargas (punto siguiente).
  - El "Estado actual" de `CLAUDE.md` todavía dice que los datos salen de mocks "salvo los dominios ya migrados": con este corte ya no queda ninguno.
- **[menor, a confirmar]** `DashboardPage.tsx` (sección "Descargas por localidad"): sin descargas en el período, la tabla por localidad se muestra con
  ceros y no con `EmptyState`. El criterio 8 pide `EmptyState` "en las secciones de descargas" y el contrato del test lo limita a serie, ranking, nivel
  y cargo. Es defendible, porque la tabla sigue mostrando el padrón, pero conviene dejar escrita la interpretación en `notas.md`.

## Evidencia

- `npm run test:db`: `Files=18, Tests=598 ... Result: PASS` (`metricas.test.sql ... ok`, plan de 53).
- `npm test`: `Test Files 67 passed (67) · Tests 1167 passed (1167)`.
- `npm run typecheck` (`tsc -b`): sin salida, exit 0.
- `npm run lint` (oxlint): exit 0, 4 warnings anteriores al corte (`AuthContext.tsx:71`, `DescargaModal.tsx:133`, `ConfiguracionPage.tsx:43`,
  `TallerFormPage.tsx:117`), ninguno en `dashboard`.
- `npm run build`: **no corrido**. El perfil del revisor lo bloquea ("no está permitido para este agente (perfil checks)"). Lo tiene que correr el
  coordinador antes del PR.
- Tipos: no pude comparar `database.ts` con `gen types --local` (el perfil bloquea escribir la salida). `typecheck` pasa y los tipos de las 7 funciones
  coinciden con la migración a la vista.
- `npm run db:reset`: no hizo falta. No escribí datos: los pgTAP corren en una transacción con rollback.
