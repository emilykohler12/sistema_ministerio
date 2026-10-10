---
name: postgres-rpc-triggers-trampas
description: Trampas de Postgres/PostgREST vistas en la spec talleres (2026-10-10), RPC con etiquetas (CTE con snapshot compartido, dedupe), for share, privilegios por defecto de funciones, details de supabase-js
metadata:
  type: project
---

En la crítica de la spec `talleres` (2026-10-10, tercer corte, primera RPC y primeros triggers de reglas) revisé estas cosas.
Se repiten en normativas (`normativa_etiqueta`) y en cualquier RPC de "alta al vuelo":
- **Alta al vuelo con índice de expresión:** `insert ... on conflict do nothing` + buscar ids. Un CTE de escritura no se ve
  desde el `select` de la misma sentencia (snapshot compartido), y un join contra `unnest` con duplicados normalizados da `23505`
  en la PK de la puente. Propuse 3 sentencias: dedupe por clave normalizada, insert, búsqueda aparte con `raise` si faltan ids.
  El `upsert` de PostgREST no sirve con un índice de expresión (`on_conflict` acepta solo columnas).
- **`for share` en un trigger** exige UPDATE sobre alguna columna y el `using` de update de la RLS. Ojo si se revoca UPDATE.
- **"Execute solo authenticated"** necesita `revoke ... from public, anon` (Supabase da EXECUTE por defecto).
- **SQLSTATE propio:** supabase-js expone `details` (en plural), no `detail`. Evitar la clase `PT` (PostgREST la usa para el HTTP).
- **Política de una tabla puente:** con `exists (select 1 from taller t where t.id = taller_id)` alcanza, porque la subconsulta
  hereda la RLS de `taller`.
- **Una regla que solo bloquea "publicado"** frente a otra que cuenta "no inactivos" no forma un invariante. Propuse la versión espejo.

En la crítica del código de la fase A (2026-10-10) aparecieron más cosas:
- **`db:types` no marca nullable ningún argumento de RPC.** Solo sale opcional (`?`) si tiene `default`. Un contrato del tipo
  "`p_id` nulo = alta" no tipa en supabase-js. Propuse `p_id int default null` al final de la firma.
- **pgTAP que no distingue:** el primer valor de la entrada ya venía normalizado (el test del `btrim` pasaba igual sin `btrim`).
  La "lectura pública" se probaba con una etiqueta que también era visible con la política vieja. La rama de borrado de la
  sincronización nunca borraba nada. `has_function_privilege('anon')` ya incluye a PUBLIC (el chequeo con `aclexplode` sobra).
- El crítico **sí** puede correr `npm run test:db` y `docker exec -i supabase_db_sistema_ministerio psql -U postgres` con
  `begin ... rollback`. Después, volver a correr `test:db`, porque los tests suponen que no hay categorías.

En la crítica del código de la fase A de recursos (2026-10-10), con `ordenar_recursos`:
- Un `update ... where col is distinct from nuevo` en READ COMMITTED no es "gana el último": descarta, sin esperar el lock, las filas
  que en su snapshot ya coinciden. Dos llamadas simultáneas pueden dejar una mezcla. Si hace falta serializar, se usa
  `pg_advisory_xact_lock(id)`. Un `FOR UPDATE` bajo RLS filtra filas para quien no tiene la marca, y eso cambia los errores que esperan los tests.

Se repitió por tercera vez: una función pura en `consultas.ts` (`filtrarTalleres`) y un catálogo fijo leído con un hook
(destinatarios, igual que `NIVELES`).

En la crítica de la spec `normativas` (2026-10-10) verifiqué en la base local:
- **`WHEN` con `OLD` no entra en un trigger `insert or update or delete`** (error "INSERT trigger's WHEN condition cannot reference OLD").
  `auditar()` se engancha combinado, así que excluir columnas obliga a separar `after insert or delete` + `after update when (...)`. Las
  guardias globales solo miran que exista el trigger, no el `WHEN`: pedir pgTAP por comportamiento. Alternativa más simple que
  `to_jsonb(old) - ...`: `when (old.col = new.col)` + grant de UPDATE por columna sin `col` (molde `categoria`/`recurso`).
- **EXECUTE se chequea en llamadas anidadas** con el rol actual: una función auxiliar "sin grant a la API" llamada desde una RPC invoker
  da `permission denied`. Si es invoker, darle EXECUTE a `authenticated` no abre nada.
- Una RPC que escribe la fila completa con datos del form (incluida una ruta de Storage) puede repuntar a un archivo ya borrado si la caché
  está vieja: argumento `default null` = conservar y devolver la ruta anterior leída con `for update`.
- `postgres` en Supabase local: `rolsuper = f`, `rolbypassrls = t` (un definer de postgres saltea la RLS).

En la crítica del código de la fase A de normativas (2026-10-10):
- **`db:types` tipa no nulas las columnas de `RETURNS TABLE`** (`ruta_anterior: string`, aunque en el alta sea null) y devuelve un array.
  Hay que tiparlas a mano en `consultas.ts`.
- **"Devolver la ruta anterior" también cuando se conserva el archivo es una trampa:** el cliente compara contra una ruta nueva que no
  existe y borra el archivo vivo. Propuse devolverla solo si se reemplazó: `nullif(anterior, coalesce(p_ruta, anterior))`.
- **Un definer de `postgres` es robusto por partida doble:** `postgres` es el dueño de la tabla (sin `force row level security`) y además
  tiene bypassrls. `service_role` conserva el UPDATE de toda la tabla aunque se revoque a anon/authenticated: no basta para decir que
  "la RPC es la única forma".
- **Tests de "atomicidad" vacíos:** si el error salta antes del paso que dejaría rastro, el test pasa con cualquier implementación.

**Why:** son fallas silenciosas o errores en el caso feliz que ni el typecheck ni el pgTAP básico detectan.

**How to apply:** en cada spec con RPC, trigger de regla o tabla puente, pedir que el algoritmo esté escrito paso a paso y que
haya un pgTAP con duplicados normalizados. Ver la `## Respuesta` de `docs/specs/talleres/critica.md` para saber qué se aceptó.
Relacionado: [[supabase-auth-rls-trampas]], [[auditoria-falla-cerrada]].
