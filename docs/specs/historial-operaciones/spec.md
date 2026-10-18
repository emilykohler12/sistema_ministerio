# Historial de operaciones

- **Estado:** aprobada
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-18
- **Issue:** #20

## Objetivo
El administrador necesita saber quién cambió qué y cuándo en el panel (§5.2, 0005). Hoy `registro_operacion` ya guarda cada
alta, modificación y baja con `auth.uid()`, pero no hay forma de verla. Esta feature agrega una pantalla de solo lectura con filtros.

## Criterios de aceptación
1. Dado un admin, cuando entra a `/admin/historial` (enlace "Historial" en el menú), ve las operaciones de la más reciente a la más
   vieja, de a 50, con fecha y hora (Argentina), usuario (email, o "Sistema" si `usuario_id` es NULL), acción (Alta / Modificación /
   Baja), entidad y una descripción del registro (nombre o título de `datos_nuevos ?? datos_anteriores`; si no hay, `#<registro_id>`;
   en las puentes, sus dos ids).
2. Cuando expande una fila, ve una tabla campo / antes / después: en una modificación, solo los campos que cambiaron (sin `updated_at`);
   en un alta o una baja, todos los campos. Si la modificación solo cambió `updated_at`, la fila dice "Sin cambios en los campos del
   registro" y no se expande.
3. Cuando filtra por desde/hasta (fechas opcionales, días completos en hora de Argentina), usuario (los que tienen operaciones, más
   "Sistema") o entidad, la lista y el total se recalculan, la página vuelve a 1 y la fila expandida se colapsa. Filtros y página viven
   en la URL (`?desde&hasta&usuario&entidad&pagina`); un valor inválido (usuario que no es uuid ni `sistema`, entidad desconocida,
   página que no es un entero ≥ 1) se descarta.
4. Con `desde > hasta` o una fecha mal formada, el error aparece junto a los campos y no se consulta.
5. Sin resultados, o con una página fuera de rango (`PGRST103`), se ve `EmptyState` con "Limpiar filtros". Si una consulta falla, un
   mensaje con "Reintentar". Si falla solo la de usuarios, la lista se muestra con el uuid corto.
6. Una cuenta sin `app_metadata.admin` no ve filas (RLS existente) y `usuarios_historial()` le da `42501`; anon no tiene EXECUTE.
7. Un usuario baneado sigue apareciendo con su email (§10.1).

## Diseño
- `supabase/migrations/<ts>_historial.sql`: índices `registro_operacion (fecha_hora)` y `(tabla, fecha_hora)`. RPC
  `usuarios_historial() returns table (id uuid, email text)` en **plpgsql** (una función `sql` no puede lanzar el `42501`), **security definer**, `search_path` vacío,
  `es_admin()` primero (`42501`): `distinct usuario_id` de `registro_operacion` cruzado con `auth.users`, `email::text` no nulo,
  orden por email. `revoke` de `public`, `anon` y `service_role`; EXECUTE solo `authenticated`.
- `supabase/tests/historial.test.sql`: `has_function_privilege`, `42501` sin marca, sin usuarios ajenos al historial, el caso del
  baneado e índices.
- `src/shared/lib/date.ts`: `formatFechaHoraArgentina`. `src/shared/components/ui/Paginacion.tsx`: anterior, siguiente y "página X de Y".
- `src/features/historial/`:
  - `types.ts`: `Operacion` (fila) y `UsuarioHistorial` (`Returns`).
  - `entidades.ts` (puro): `Record<Exclude<keyof Tables, 'registro_operacion'>, Entidad> satisfies` (una tabla nueva rompe el
    typecheck), `ENTIDADES_FILTRABLES` (sin Nivel, Localidad ni Destinatario) y `describir(op)`.
  - `diff.ts` (puro): `cambios(op) → {campo, antes, despues}[]`.
  - `filtros.ts` (puro): URL ↔ filtros con saneo, `validarFiltros` y los límites del día en `-03:00`.
  - `consultas.ts`: select con `.gte/.lt('fecha_hora')`, `.eq('usuario_id')` o `.is(null)`, `.in('tabla')`, `order('id', desc)`,
    `.range((p-1)*50, p*50-1)`, `count: 'exact'` y `PGRST103` → `{ filas: [], total: null }` (el error no trae conteo); `rpc('usuarios_historial')`.
  - Hooks: `useHistorial(filtros)` (`['historial', filtros]`, `keepPreviousData`, `enabled` con filtros válidos) y
    `useUsuariosHistorial()` (`['historial', 'usuarios']`).
  - `components/`: `FiltrosHistorial`, `TablaHistorial` (tabla HTML, 0025; fila expandible por botón con `aria-expanded`) y
    `DetalleOperacion`.
- `src/pages/admin/HistorialPage.tsx` (molde del dashboard con `isPlaceholderData` y `aria-busy`), la ruta en `router.tsx` y el
  enlace en `AdminSidebar.tsx`. `docs/arquitectura.md`: dominio, ruta y migración.
- Tests del frontend: los de cada módulo puro, `consultas.test.ts` con la cadena mockeada (`.is(null)`, `.lt` del día siguiente,
  `.range`, `PGRST103`), los de los hooks con su rama de error y el de la página.
- Decisiones de la entrevista: emails por RPC definer, entidad agrupada en el cliente, diff en el cliente, paginación por offset de 50.

## Fuera de alcance
- Filtro por acción, búsqueda de texto, exportar a CSV, retención o purga, y deshacer.
- Nombres de personas y de los registros referenciados por las puentes (se muestran por id hasta #34 o una vista), y enlaces al
  registro afectado.

## Verificación de punta a punta
1. `npm run db:reset`, entrar como `admin@dam.local`, crear y editar un taller con etiquetas y borrar un recurso.
2. En `/admin/historial`: aparecen las operaciones con el email, la de Taller agrupa sus puentes y el diff muestra solo lo cambiado.
3. Filtrar por Taller, por "Sistema" (vacío) y por un rango invertido; abrir `?pagina=999` y `?usuario=x`; copiar la URL en otra pestaña.
4. Por REST con el token de `sin-permiso@dam.local`: `registro_operacion` da `[]` y `usuarios_historial` da `42501`.
