# Plan: borrar etiquetas sin uso (#31)

**Objetivo:** que una etiqueta que ya no usa ningún taller ni normativa se borre sola y deje de sugerirse. Sin cambios de UI.

**Diseño (opción A):** un trigger de sentencia `after delete` sobre `taller_etiqueta` y sobre `normativa_etiqueta`, con tabla de transición,
llama a `borrar_etiquetas_huerfanas()` (**security definer**, `search_path` vacío, solo la ejecuta el trigger: sin EXECUTE para nadie). Borra de `etiqueta` solo
los ids que aparecen en las filas recién borradas y no están en ninguno de los dos puentes. Limitarse a esos ids evita borrar una etiqueta recién
creada por `resolver_etiquetas` que todavía no se vinculó. Cubre editar un taller, editar una normativa y la baja de una normativa (cascada).
`etiqueta` sigue sin política ni grant de delete para el admin; el `etiqueta_auditar` existente registra cada borrado.

**Archivos:**
- `supabase/migrations/<ts>_etiquetas_huerfanas.sql`: función y dos triggers.
- `supabase/tests/etiquetas_huerfanas.test.sql`: pgTAP.
- `src/features/normativas/hooks/useNormativas.ts` (+ test): la baja invalida también `['etiquetas']`.
- `docs/arquitectura.md`: la migración, el dominio `etiquetas` y la nota de Brechas (normativas). Comentario de `etiqueta` en `talleres.sql`: no se toca (migración ya aplicada), lo aclara la nueva.

**Pasos (test primero):**
1. pgTAP en rojo: quitar la última etiqueta de un taller la borra; si otra normativa o taller la usa, queda; lo mismo con una normativa; la baja de una
   normativa borra sus etiquetas exclusivas; guardar un taller con una etiqueta nueva y quitar otra en la misma llamada conserva la nueva; el borrado queda en
   `registro_operacion`; la función no es ejecutable por `anon` ni `authenticated`; el admin sigue sin poder hacer `delete` directo en `etiqueta`.
2. Migración. 3. Test de `useNormativas` (la baja invalida `['etiquetas']`) y el cambio.

**Riesgo conocido:** si un guardado resuelve una etiqueta sin uso mientras otro le quita el último vínculo, el insert del primero falla por la FK. No hay
inconsistencia: el guardado se reintenta. Se acepta (dos admins, ventana mínima).

**Limpieza inicial (decidida por el usuario):** la misma migración, después de crear función y triggers, hace un `delete` único de las etiquetas que hoy no están
en ningún puente. Corre sin sesión, así que `auditar()` lo registra con `usuario_id` nulo ("Sistema" en el historial); el implementador verifica que `auditar()` lo
acepte en una migración (falla cerrada) y, si no, lo resuelve y lo reporta. Test: tras `db:reset` el seed no deja huérfanas, y el pgTAP prueba la sentencia de limpieza sobre filas huérfanas creadas en el test.

**Fuera de alcance:** botón de limpieza, UI.

**Verificación:** `npm run test:db`, `npx vitest run src/features/normativas src/features/etiquetas`, `npm run lint`, `npm run typecheck`, `npm run db:reset`.
Toca base pero no Storage, anon ni rutas: sin `qa`; corro `npm run test:e2e` como regresión y después `npm run db:reset`.
