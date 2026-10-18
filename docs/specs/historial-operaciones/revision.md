# Revisión — Historial de operaciones (#20)

Revisor, 2026-10-18. Revisé el diff contra `main`, más los archivos nuevos sin commitear: la migración, el pgTAP, `src/features/historial/**`,
`HistorialPage` (y su test), `Paginacion` (y su test), `date.ts`, el router, el sidebar, `database.ts` y `arquitectura.md`.
Contrasté todo con la spec (criterios 1-7) y con `critica.md` (## Respuesta).

## Veredicto
Aprobado

No hay hallazgos críticos ni importantes. Los menores de abajo son huecos de test y un caso borde de la URL, y ninguno incumple un criterio.

## Cumplimiento de los criterios

| # | Implementación | Test que lo cubre |
|---|---|---|
| 1 | `HistorialPage` + `TablaHistorial`: orden `id desc`, `.range` de 50, `formatFechaHoraArgentina`, email / "Sistema" / uuid corto, Alta-Modificación-Baja, `entidadDeTabla`, `describir` (`nombre ?? titulo ?? #id`, puentes por sus dos ids) | `consultas.test.ts` (orden, rangos 0-49 / 50-99 / 450-499), `date.test.ts`, `entidades.test.ts`, `HistorialPage.test.tsx` "lista" |
| 2 | `diff.ts` `cambios()` sin `updated_at` en UPDATE, todos los campos en alta y baja; sin cambios → texto y sin botón | `diff.test.ts`, `HistorialPage.test.tsx` "detalle" |
| 3 | `filtros.ts` (saneo de usuario, entidad y página; límites `-03:00` con `hasta + 1` exclusivo), `cambiarFiltros` con `pagina: 1`, colapso por `clave` de la URL | `filtros.test.ts`, `consultas.test.ts` (`.is(null)`, `.lt` del día siguiente, `.in` con las puentes), `HistorialPage.test.tsx` "filtros" y "paginación" |
| 4 | `validarFiltros` (fecha mal formada o irreal y `desde > hasta`), `enabled` del hook, `FieldError` con `aria-describedby` | `filtros.test.ts`, `useHistorial.test.ts`, `HistorialPage.test.tsx` "filtros inválidos" |
| 5 | `EmptyState` con "Limpiar filtros" (también con `PGRST103` → `{ filas: [], total: null }`), `ErrorFallback` con "Reintentar", uuid corto si falla la RPC | `consultas.test.ts` (PGRST103 y otro PGRST), `HistorialPage.test.tsx` "estados" |
| 6 | RPC: `es_admin()` primero → `42501`; `revoke` de public, anon y service_role; RLS de `registro_operacion` sin cambios | `historial.test.sql` (mismo `sub` con y sin marca, anon, service_role, `aclexplode` de PUBLIC), `registro_operacion.test.sql` |
| 7 | La RPC no filtra por `banned_until` | `historial.test.sql` (usuario con `banned_until` dentro de 10 años) |

Seguridad. La RPC es `security definer` con `search_path = ''`, todo calificado (`public.es_admin()`, `public.registro_operacion`, `auth.users`).
Expone solo `id` y `email`, solo de quienes tienen operaciones y solo al admin. No hay secretos, y las tablas no cambian (no hay RLS nueva que revisar).
Esta vez `service_role` quedó sin EXECUTE y con su test, que es el hueco que se había repetido en cuatro cortes anteriores.

`database.ts`: el bloque `usuarios_historial` tiene el mismo formato que el resto del archivo generado (`Args: Record<PropertyKey, never>`, igual que `es_admin`),
y el diff son solo esas 5 líneas en orden alfabético. No veo señales de una edición a mano. No pude regenerarlo para compararlo: el perfil del revisor
bloquea `supabase gen types`.

Desvíos conocidos. plpgsql en vez de sql está en la spec y en la cabecera de la migración, con su razón. Del ajuste de `renderPagina` en el test de la página:
el helper espera el vacío o la tabla según los datos, y no debilita ningún assert.

## Problemas
- **[menor]** `supabase/tests/historial.test.sql:96-99`: el assert "ordenados por email" es vacuo. `historial-a` < `historial-b-baneado` coincide con el orden
  de los uuid (`aaaa…` < `bbbb…`) y con el de inserción, así que un `order by u.id` o un `order by` faltante también da verde. **Arreglo:** que el orden por email
  sea el inverso del de los uuid. Por ejemplo, darle a B un email que ordene antes (`historial-0-baneado@…`) y ajustar el `values`.
- **[menor]** `supabase/tests/historial.test.sql:37`: `has_function` no fija la firma de salida. Una columna extra en `returns table` (por ejemplo,
  `raw_user_meta_data`) pasaría todos los asserts, porque cada uno selecciona `email` o `id` por nombre. **Arreglo:**
  `is(pg_get_function_result('public.usuarios_historial()'::regprocedure), 'TABLE(id uuid, email text)')`.
- **[menor]** `src/features/historial/filtros.ts:203-209`: `fechaReal` acepta el año `0000`, porque JS tiene año 0. Postgres no lo tiene, y `?desde=0000-01-01`
  manda `.gte('fecha_hora', '0000-01-01T00:00:00-03:00')`, que debería dar `22008`. La pantalla queda entonces en "Reintentar", que vuelve a fallar siempre: es el
  mismo caso que el criterio 3 quiso evitar al sanear la URL. *A verificar:* el perfil del revisor no deja hacer el GET contra el PostgREST local. **Arreglo:**
  rechazar `anio < 1` en `fechaReal`, con un caso en `filtros.test.ts`.
- **[menor]** `src/pages/admin/HistorialPage.test.tsx:420-430`: el test "si falla solo la consulta de usuarios" no espera al estado de error. El uuid corto también
  se ve mientras la RPC carga, y `waitFor(... toHaveBeenCalled())` solo confirma que se llamó. Hoy pasa porque `retry: false` resuelve enseguida, pero no fija la
  rama `isError`. **Arreglo:** `await screen.findByText(/no pudimos cargar los emails/i)` antes de los asserts de las filas.
- **[menor]** Proceso: `critica.md` (Respuesta 2) dice que el implementador verifica el `PGRST103` contra el PostgREST local, y no hay un `notas.md` ni otra
  constancia de esa verificación ni de los desvíos. No afecta el comportamiento. La página distingue por `total` (`null`, o `> 0` con `pagina > 1`), así que muestra
  el vacío tanto si PostgREST responde 416 como si responde 200 `[]`. Conviene que el `qa` lo confirme con `?pagina=999`, como ya pide el paso 3 de la verificación.

## Evidencia

```
$ npm run lint
> oxlint
4 warnings preexistentes (AuthContext.tsx, ConfiguracionPage.tsx, TallerFormPage.tsx, DescargaModal.tsx); ninguno en archivos del corte
exit 0, 0 errores

$ npm run typecheck
> tsc -b
(sin salida, exit 0)

$ npm test
 Test Files  81 passed (81)
      Tests  1398 passed (1398)

$ npm run test:db
/workspaces/sistema_ministerio/supabase/tests/historial.test.sql ........... ok
(20 archivos, todos ok, incluidas las guardias globales)
All tests successful.
Files=20, Tests=660
Result: PASS
```

pgTAP corre dentro de `begin … rollback`, así que la base local queda igual y no hace falta `db:reset`. No corrí e2e: está fuera de alcance y lo hace `qa`.
