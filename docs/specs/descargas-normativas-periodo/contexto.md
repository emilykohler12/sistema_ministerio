# Contexto: descargas de normativas por período (#32)

Hechos del código al 2026-11-12 (informe de `Explore`). Sin diseño propuesto.

## 1. Contador actual de normativas
- `normativa.descargas int not null default 0` (`20261010155300_normativas.sql` l.16). Solo lo cambia la RPC `contar_descarga_normativa(p_id)` (`security definer`, `search_path=''`, EXECUTE para `anon` y `authenticated`). No guarda cuándo, quién ni desde dónde.
- Grant de UPDATE por columna sin `descargas`. Triggers de update (`auditar()` y `tocar_updated_at()`) con `WHEN` que los omite si solo cambió el contador (ADR 0017). Un UPDATE con bypass que cambia `descargas` y otra columna sí se audita.
- #25 (`20261016130000_no_contar_admin.sql`): la RPC lleva `where id = p_id and not (select public.es_admin())`; con sesión de admin no cuenta y responde bien.
- Sin tope de frecuencia: el comentario de la RPC dice «anti-abuso fuera de alcance (solo sessionStorage en el cliente)». El tope por IP de 0030 (30 en 10 minutos, `intento_descarga`, `ip_cliente()`) vive solo en `registrar_descarga` (talleres).
- Baja de normativas: física (`definicion-dam.md` l.563).

## 2. Cliente de normativas
- `normativas/consultas.ts:56-57` `contarDescargaNormativa(id)` = `supabase.rpc('contar_descarga_normativa', { p_id })`.
- `normativas/hooks/useNormativas.ts:61-75`: `contarDescarga(id)` (función, no hook; `arquitectura.md` lo llama `useContarDescarga`), marca `normativa-descarga-contada:<id>` en `sessionStorage` antes de llamar, cuenta igual si `sessionStorage` falla, no espera la respuesta. `EnlaceDescarga.tsx:2,16-18` lo llama en `onClick` y en clic central.
- Tests: `useNormativas.test.ts:242-274`; pgTAP `normativas.test.sql` (l.193-212 permisos, 299-307 anon cuenta, 370, 391 UPDATE de `descargas` da 42501, 402 admin no cuenta, 640 `updated_at`). Sin test de `consultas.ts` de normativas.

## 3. Dashboard
- Seis RPC `metricas_*` (invoker, solo `authenticated`, solo conteos) sobre la auxiliar `metricas_registros(p_desde, p_hasta)` (42501 sin admin, 22023 con período inválido, hora de Argentina, `[desde, hasta]` inclusivo, filtro sargable; `20261016120000_metricas.sql`). Ninguna toca `normativa`.
- `dashboard/consultas.ts:19-41`: `Promise.all` de las seis RPC y de `from('normativa').select('id, titulo, numero, anio, descargas')`, sin período. `types.ts`: `NormativaConteo` («acumulado, sin período»). `calculos.ts:31-33` `ordenarNormativas` (descargas desc, id asc). `TablaNormativas.tsx` (columnas Normativa, Número/año, Descargas; vacío «Todavía no hay normativas cargadas»).
- `DashboardPage.tsx:56` KPI «Normativas» = `normativas.length`; l.101-102 sección «Normativas» con descripción «Total histórico: el contador no depende del período.». Período en la URL (`?periodo=30d|anio|rango&desde&hasta`), `useMetricas` con clave `['dashboard', desde, hasta]` y `keepPreviousData`.
- Tests que fijan el comportamiento actual: `DashboardPage.test.tsx` l.309-314 y 509-529, `consultas.test.ts` l.11, 32, 47 (el `select` exacto), `useMetricas.test.ts`, `e2e/dashboard.spec.ts` l.68, 113, 152-155 (celda final de normativas vale `1`), `e2e/no-contar-admin.spec.ts` (el admin no cambia el tablero; un anónimo sube en 1).

## 4. Molde de tabla de eventos: `registro_descarga`
- Sin `updated_at`, FK sin cascada, RLS con select solo `es_admin()`, `revoke all` para `anon` y `authenticated`, sin grants ni políticas de escritura (única vía: la RPC definer), `fecha_hora timestamptz default now()`, índice por `fecha_hora`. Trigger `auditar()` solo `after update or delete`; el INSERT anónimo no se audita (0022).
- Guardias globales que una tabla nueva debe cumplir: `rls_global` (RLS activo), `auditoria_global` (máscara 28 salvo excepción por evento declarada en su lista `values (...)` con comentario: hoy `registro_operacion`, `registro_descarga` INSERT, `intento_descarga`), `truncate_global` (sin TRUNCATE para anon ni authenticated), `updated_at_global` (solo si hay `updated_at`).

## 5. ADR
- 0017: dos triggers (`insert or delete` y `update` con `WHEN`); descarta la «tabla aparte de contadores» porque obliga a una excepción en `auditoria_global`; «cualquier contador futuro reutiliza este patrón».
- 0022: el INSERT de un hecho anónimo no se audita; `auditoria_global` con excepciones por evento.
- 0024: una RPC `returns table` por indicador, invoker, solo conteos, período en hora de Argentina; agregar un indicador es una RPC nueva sin tocar las demás.
- 0030: tope por IP solo en `registrar_descarga`; «se protegen las métricas, no el acceso»; varias PC detrás de una IP comparten el tope.

## 6. Documentos
- `definicion-dam.md`: l.230 «Todos los indicadores admiten un filtro de período»; l.240 «Descargas de normativas | Contador por normativa»; l.504-509 `descargas` como contador anónimo; l.627-629 la descarga invoca la RPC. No dice que se midan por período.
- `arquitectura.md`: brechas l.147 y l.149 («las descargas de normativas por período exigen una tabla de eventos»).

## 7. Hechos a tener presentes
- Las descargas ya contadas en `normativa.descargas` no tienen fecha: no se pueden asignar a un período.
- La tabla de eventos crecería con cada descarga anónima, sin tope por IP hoy.
- Las migraciones ya commiteadas no se editan (`.claude/rules/migraciones.md`).
