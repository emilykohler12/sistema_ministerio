# Contexto — Historial de operaciones (#20)

Relevado por `Explore` el 2026-10-18.

## `registro_operacion` y `auditar()` (`supabase/migrations/20261010003733_base.sql`)

```sql
create table public.registro_operacion (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users (id),   -- NULL = sistema
  operacion text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  tabla text not null,                           -- tg_table_name
  registro_id text,                              -- ->> 'id'; NULL en PK compuesta
  datos_anteriores jsonb,                        -- to_jsonb(old)
  datos_nuevos jsonb,                            -- to_jsonb(new)
  fecha_hora timestamptz not null default now()
);
```

- Guarda filas completas, no un diff. Solo tiene el índice de la PK: no hay índices por `fecha_hora`, `usuario_id` ni `tabla`.
- RLS: solo SELECT para `authenticated` con `es_admin()`; anon y service_role sin privilegios; secuencia cerrada.
- `auditar()`: security definer, `search_path` vacío, `auth.uid()` del JWT. Las RPC invoker y definer conservan al admin
  como usuario (`vinculacion.test.sql:246`). service_role y el script del padrón dejan `usuario_id` NULL.

## Tablas auditadas

- Con insert, update y delete: `configuracion`, `nivel_educativo`, `categoria`, `taller`, `destinatario`, `etiqueta`,
  `taller_destinatario`, `taller_etiqueta`, `recurso`, `normativa_etiqueta`, `localidad`, `establecimiento`.
- `normativa`: alta y baja, y la edición con `WHEN`, que omite el contador (0017).
- `registro_descarga`: solo update y delete (0022); los UPDATE llegan por `vincular_institucion`, uno por descarga.
- Las puentes (`taller_destinatario`, `taller_etiqueta`, `normativa_etiqueta`) tienen `registro_id` NULL.
- El volumen es bajo y sale del panel. Los picos son guardar un taller (varias filas por guardado), vincular instituciones
  y la carga del padrón (miles de filas sin usuario).

## Usuarios

- No hay tabla de perfiles. `auth.users` no es accesible por PostgREST.
- `seed-usuarios.mjs` crea `admin@dam.local` y `sin-permiso@dam.local` con email y `app_metadata.admin`, sin nombre.
- Desde el cliente solo se conoce el `usuario_id` (uuid), salvo el email propio en el JWT.

## Tipos (`src/shared/types/database.ts:228-241`)

`operacion` y `tabla` son `string`; `datos_*` son `Json | null`. No hay relación con `auth.users`.

## Patrones de referencia

- Dashboard: `periodo.ts` (puro, URL ↔ período, hora de Argentina, `validarPeriodo`), `consultas.ts` con `leer<T>`,
  `useMetricas` con `keepPreviousData` y `enabled` por validez, tablas HTML (0025), página en `pages/admin/DashboardPage.tsx`.
- Establecimientos: filtro en la URL (`?localidad=`), pedido por localidad por el tope de 1000 filas de PostgREST.
- No hay paginación (`.range`) ni componente de tabla o paginación en `ui/`.
- Rutas: `src/app/router.tsx` (lazy + `handle.title`); menú: `src/shared/components/layout/AdminSidebar.tsx:6-12`.
- Reglas de React: `.claude/rules/react.md` (`isPending`, rama de error con test, `idDeRuta`, `Constants.public.Enums`).

## Tests existentes

`registro_operacion.test.sql` (estructura, privilegios, RLS), `auditar.test.sql` y `auditoria_global.test.sql`.
No hay tests de lectura del historial.

## Riesgos

- Seq scan al filtrar cuando la tabla crezca (no hay índices).
- `datos_*` traen filas completas: `registro_descarga` incluye `cargo_otro` e `institucion_otra`.
- Tope de 1000 filas: hace falta paginar.
- `tabla` es el nombre físico, no la "entidad" de §5.2.
