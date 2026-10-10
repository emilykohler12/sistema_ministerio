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

Se repitió por tercera vez: una función pura en `consultas.ts` (`filtrarTalleres`) y un catálogo fijo leído con un hook
(destinatarios, igual que `NIVELES`).

**Why:** son fallas silenciosas o errores en el caso feliz que ni el typecheck ni el pgTAP básico detectan.

**How to apply:** en cada spec con RPC, trigger de regla o tabla puente, pedir que el algoritmo esté escrito paso a paso y que
haya un pgTAP con duplicados normalizados. Ver la `## Respuesta` de `docs/specs/talleres/critica.md` para saber qué se aceptó.
Relacionado: [[supabase-auth-rls-trampas]], [[auditoria-falla-cerrada]].
