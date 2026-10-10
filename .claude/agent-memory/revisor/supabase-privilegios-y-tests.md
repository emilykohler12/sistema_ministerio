---
name: supabase-privilegios-y-tests
description: Huecos que se repiten en migraciones Supabase del DAM; grants por defecto en secuencias/funciones, ramas de respaldo de triggers sin test, chequeos "solo local" por prefijo
metadata:
  type: project
---

En la Fase B de supabase-base (2026-10-10) aparecieron estos huecos. Es probable que se repitan en cada corte de dominio:

- `revoke all on <tabla>` no alcanza a la **secuencia de identidad**: anon/authenticated/service_role conservan USAGE+UPDATE
  por los default privileges de Supabase. Lo mismo con funciones: `revoke execute` de una SECURITY DEFINER suele olvidar
  a `service_role`.
- Las ramas `exception when ...` de los triggers (fallbacks) quedan sin test: el test hace `lives_ok` pero no verifica qué
  se escribió en la tabla de auditoría.
- Los fallbacks que escriben `usuario_id NULL` sin `raise warning` confunden "sin sesión" con "usuario inexistente".
- Las defensas "solo local" en scripts comparan URL por prefijo (`startsWith('http://localhost')`).
- La definición (§8.3 y el diagrama ER) queda con `varchar` cuando la migración usa `text`.

**Why:** el criterio 6 pedía que nadie de la API escriba, y el contrato "NULL = sistema" es de auditoría. Con
`has_table_privilege` solo sobre la tabla, el hueco de la secuencia no se ve.
**How to apply:** en cada migración, consultá los privilegios reales con psql (`docker exec supabase_db_sistema_ministerio
psql -U postgres`): tabla, secuencia y funciones, para anon/authenticated/service_role. Pedí un assert por cada rama de
excepción. Probá los casos borde de `auth.uid()` (sub inexistente, sub que no es uuid). Ver también [[hooks-denylist-evasion]].
