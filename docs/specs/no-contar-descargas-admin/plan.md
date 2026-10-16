# Plan: no contar las descargas del administrador (#25)

**Objetivo.** Con sesión de admin (`es_admin()`), `registrar_descarga` y `contar_descarga_normativa` vuelven sin error, sin insertar en
`registro_descarga` ni incrementar `normativa.descargas`. `DA003` y `DA004` se siguen validando; los CHECK de la tabla no se evalúan
para el admin (vuelve antes del `insert`; zod aplica las mismas reglas). El cliente no cambia. Ver `critica.md`.

**Archivos.** Migración nueva `supabase/migrations/<ts>_no_contar_admin.sql` con `create or replace` de las dos RPC (repetir
`security definer` y `set search_path = ''`):
- `registrar_descarga`: `if public.es_admin() then return; end if;` después del bloque `DA004` y antes del `insert`, con comentario.
- `contar_descarga_normativa`: sigue en `language sql`, `where id = p_id and not (select public.es_admin())`.
Tests: `supabase/tests/descargas.test.sql`, `supabase/tests/normativas.test.sql`. Docs: `docs/arquitectura.md` (sacar la brecha de
Descargas y Dashboard; anotar la regla en las dos RPC).

**Pasos (TDD).**
1. Rojo editando lo existente: `normativas.test.sql:635-638` espera 1 (solo anon); `:397-399` pasa a "no falla, pero no cuenta";
   `descargas.test.sql:501-504` suma un `results_eq` con la fila `localidad_id = 7` (authenticated sin marca sí registra). En el
   bloque `-- admin` de `descargas.test.sql`: admin con datos válidos y marca propia (`localidad_id = 8`) → `count = 0`; con un taller
   en borrador → `DA003`; con un establecimiento de otra localidad → `DA004`. Subir los `plan(n)`.
2. La migración en verde.
3. `npm run db:reset && npm run test:db`, `npm test`, `npm run lint`, `npm run typecheck`.

**Verificación.** Revisor y luego `qa` (0023): un e2e por el dashboard. Con la sesión de admin: leer el KPI de descargas, descargar un taller
y abrir una normativa, recargar `/admin` y ver que no cambió. Después, una descarga anónima que lo sube en 1.

**Fuera de alcance.** Borrar descargas de admin ya registradas, cambios en el cliente y en `metricas_*`.
