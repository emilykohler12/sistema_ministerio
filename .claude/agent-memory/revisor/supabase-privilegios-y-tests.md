---
name: supabase-privilegios-y-tests
description: Huecos que se repiten en migraciones Supabase del DAM; default privileges de public (tablas/secuencias/funciones), ramas de excepción de triggers sin test, chequeos "solo local" por prefijo, docs desalineadas
metadata:
  type: project
---

En la Fase B de supabase-base (2026-10-10) aparecieron estos huecos. Todos se corrigieron en la segunda revisión, pero
es probable que se repitan en cada corte de dominio:

- Los default privileges de `public` (dueños postgres y supabase_admin) dan `arwdDxtm` sobre tablas, `rwU` sobre secuencias
  y EXECUTE sobre funciones a anon, authenticated y service_role (y a PUBLIC en funciones). Cada tabla nueva nace abierta
  y solo la RLS la protege. `revoke all on <tabla>` no alcanza a la **secuencia de identidad**. El `revoke execute` de una
  SECURITY DEFINER suele olvidar a `service_role` y a `public`.
- Las ramas `exception when ...` de los triggers (fallbacks) quedan sin test: el test hace `lives_ok` y no verifica qué se
  escribió en la tabla de auditoría.
- Desde la spec v3, `auditar()` **falla cerrada**: sin bloque `exception`. Si alguien vuelve a envolver el insert, se rompe
  el criterio 7. Verificá que haya `throws_ok` 23503 (sub inexistente) y que no reaparezca un fallback silencioso.
- Las defensas "solo local" en scripts comparan la URL por prefijo (`startsWith('http://localhost')`).
- La definición queda desalineada con la migración: `varchar` contra `text` en §8.3 y "diff" contra OLD/NEW completos en §8.4.

**Why:** el criterio 6 pedía que nadie de la API escriba, y el contrato de auditoría es "NULL = sistema" con falla cerrada.
Si solo se mira `has_table_privilege` sobre la tabla, el hueco de la secuencia no aparece.
**How to apply:** en cada migración, consultá los privilegios reales con psql (`docker exec supabase_db_sistema_ministerio
psql -U postgres`, mirá `relacl`, `proacl` y `pg_default_acl`) para anon, authenticated y service_role. Pedí un assert por
cada rama de excepción. Probá los casos borde de `auth.uid()` (sub inexistente, sub que no es uuid). Probá también que
authenticated no pueda hacer `CREATE TRIGGER` con una función SECURITY DEFINER. Ver también [[hooks-denylist-evasion]].
