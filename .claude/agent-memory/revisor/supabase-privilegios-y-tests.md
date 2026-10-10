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

En la Fase B de auth-configuracion (tabla `configuracion`, 2026-10-10) la base quedó bien. Lo que faltó, y probablemente
se repita, son los asserts de las barreras que existen pero no tienen test: el `CHECK` que impide cambiar la PK desde
la API (solo se probó el INSERT como postgres) y el `revoke execute` de las funciones de trigger. Para probar por API
sirve el script del scratchpad (`supabase status -o json` por stdin). Las contraseñas del seed están en
`scripts/seed-usuarios.mjs` y son distintas por usuario.

En niveles-categorias (2026-10-10) la migración y el pgTAP salieron bien a la primera (36 asserts, cubren cada viñeta).
Para no reportar falsos positivos:
- La secuencia de identidad de las tablas de dominio (`categoria_id_seq`) queda con `rwU` para anon y authenticated.
  No es explotable: la columna es `generated always` y PostgREST no expone `nextval` (`rpc/nextval` da 404). Solo vale
  revocarla en tablas forenses, como `registro_operacion`.
- La RLS por fila no restringe columnas: el admin puede cambiar columnas que la UI fija (por ejemplo `nivel_id`). Si un
  criterio dice "no se puede cambiar X", mirá si alcanza con la UI o si hace falta un `revoke update (col)` o un trigger.

En talleres (2026-10-10) se repitió el olvido del `revoke execute` en las funciones de trigger nuevas
(`taller_validar_categoria`, `categoria_validar_baja`), aunque `tocar_updated_at` sí lo tiene. No se puede explotar
(`rpc/<fn trigger>` da 404), es menor. `guardar_taller` revoca a public y anon, pero no a service_role.

**Trampa propia del revisor:** los pgTAP asumen una base local sin categorías, talleres ni etiquetas. Si pruebo por REST y
creo filas, `test:db` queda rojo, y el clasificador de permisos bloquea el `delete` masivo con psql. Hay dos salidas: probar por
REST **dentro** de lo que después se pueda deshacer (mejor, con psql en `begin; ... rollback;` como el crítico), o avisar que hay
que correr `db:reset`. No escribir por la API sin un plan de limpieza.

**Why:** el criterio 6 pedía que nadie de la API escriba, y el contrato de auditoría es "NULL = sistema" con falla cerrada.
Si solo se mira `has_table_privilege` sobre la tabla, el hueco de la secuencia no aparece.
**How to apply:** en cada migración, consultá los privilegios reales con psql (`docker exec supabase_db_sistema_ministerio
psql -U postgres`, mirá `relacl`, `proacl` y `pg_default_acl`) para anon, authenticated y service_role. Pedí un assert por
cada rama de excepción. Probá los casos borde de `auth.uid()` (sub inexistente, sub que no es uuid). Probá también que
authenticated no pueda hacer `CREATE TRIGGER` con una función SECURITY DEFINER. Ver también [[hooks-denylist-evasion]].
