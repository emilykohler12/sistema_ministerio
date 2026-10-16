# Contexto: dashboard (Explore, 2026-10-16)

## 1. Estado actual (todo mock)
- `src/features/dashboard/`: `hooks/useDashboard.ts` (`useDashboardMetrics()`, clave `['dashboard','metrics']`, 300 ms de espera y mocks),
  `mocks/dashboard.mock.ts` (todo en cero), `components/KpiCard.tsx` (`Card`, `toLocaleString('es-AR')`). Sin `types.ts`, `consultas.ts` ni tests.
- `src/pages/admin/DashboardPage.tsx` (119 líneas):
  - h1 "Dashboard". `e2e/helpers.ts` (`loginAdmin`) lo espera, así que no se cambia.
  - Error: `ErrorFallback` con `refetch`. Carga: 4 `Skeleton`.
  - 4 KPIs: Descargas totales, Talleres publicados, Normativas publicadas y "Escuelas alcanzadas" (la definición dice "establecimientos").
  - recharts: BarChart por localidad y LineChart por fecha.
  - Barras HTML: "por nivel" y "por rol" (la definición dice "cargo").
  - No tiene período, ranking, normativas ni aviso de sin vincular.
- recharts `^3.10.1` es la única librería de gráficos. El dashboard es su único uso.
- Ruta: `src/app/router.tsx:15,80` (index de `/admin`). Menú: `AdminSidebar.tsx:7`.

## 2. Base
- `registro_descarga` (`20261010180000_descargas.sql:12-39`):
  - columnas: `id`, `taller_id` (FK sin cascada), `cargo` varchar + CHECK (6 valores, incluido 'Otro'), `cargo_otro`, `localidad_id`,
    `institucion_tipo` (`PADRON|OTRA|SIN_INSTITUCION`), `establecimiento_id` (nulo salvo PADRON; con OTRA queda nulo hasta vincular), `institucion_otra`, `fecha_hora timestamptz`;
  - solo tiene índice `taller_id`;
  - select solo `es_admin()`, sin grants de escritura.
- No guarda el nivel: se recorre `taller.categoria_id → categoria.nivel_id` (5 niveles fijos). La definición (línea 561) dice que las métricas
  se calculan en la base con vistas o funciones solo admin.
- `taller.estado` puede ser BORRADOR, PUBLICADO o INACTIVO. El admin ve todos, así que hay que filtrar por PUBLICADO a mano. No hay delete.
- `normativa.descargas`: contador acumulado (0017) que se incrementa con `contar_descarga_normativa`. No tiene fecha ni estado (todas están publicadas).
- `establecimiento.activo` (baja lógica) y `localidad` (79 filas).
- Patrón de RPC: `registrar_descarga` (definer, `search_path=''`). `guardar_*` son invoker y solo `authenticated`.

## 3. Patrón de dominio migrado
- `configuracion/` y `normativas/` siguen el mismo esquema: `types.ts` derivado de `@/shared/types/database` + `consultas.ts` (solo supabase, `if (error) throw error`) + un hook delgado.
- RPC: `supabase.rpc('nombre', args)`. Una RPC `returns table` llega como array tipado. Después de migrar hay que correr `npm run db:types`.
- `.claude/rules/datos.md` pide:
  - testear el rechazo con `mockRejectedValue`;
  - módulos puros sin supabase;
  - que un dominio no importe de otro.
- 0014: la caché se limpia al cambiar de usuario y las claves no llevan el rol.

## 4. pgTAP
- Molde `supabase/tests/descargas.test.sql`:
  - el contrato va comentado arriba;
  - el soporte se escribe como postgres al inicio;
  - roles por `set local role` y claims;
  - privilegios con `has_function_privilege`, `aclexplode(proacl)`, `prosecdef` y `proconfig`.
- Las guardias globales solo miran tablas. No hay guardia de funciones nuevas, así que cada RPC lleva su test de privilegios y de `search_path`.

## 5. Decisiones
- 0004: sin API.
- 0012: cortes, tipos derivados y hook estable.
- 0013: guardias.
- 0014: caché.
- 0017: contadores. "El dashboard reutiliza este patrón".
- 0010: la cobertura es confiable solo con vinculación, y la vinculación no existe.
- 0006 y 0022: un registro equivale a un formulario completado, no a una descarga de archivo. Las descargas del admin se cuentan, y anon puede inflar la RPC.
- 0015: el cargo "Otro" es libre.
- §5.4 sigue sin validar (C-11, P-03).

## 6-8. UI y tests
- UI disponible: `Card`, `ToggleGroup` (período), `Input` (fechas), `Select`, `Badge`, `Skeleton`, `EmptyState`, `ErrorFallback`. No hay componente de tabla: se escribe en HTML.
- Utilidades de test:
  - `src/test/utils.tsx` (`renderConProviders`, `crearWrapperQuery`);
  - molde de hook: `configuracion/hooks/useConfiguracion.test.ts`;
  - molde de página: `pages/admin/ConfiguracionPage.test.tsx`.
- `ResponsiveContainer` mide 0x0 en jsdom, así que los gráficos no se verifican ahí.
- No hay `e2e/dashboard.spec.ts`. `e2e/descargas.spec.ts` crea registros reales.
