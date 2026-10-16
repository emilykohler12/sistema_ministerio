# Plan: recursos borra la ruta de la base, no la de la caché

Rama `fix/ruta-recursos`. Antecedentes: `docs/specs/recursos/critica.md` §1 (opcional), `notas.md` (opcional no hecho). Crítica: `critica.md`.

**Objetivo.** La baja y el reemplazo de un archivo borran en Storage la ruta que tiene la fila en la base, no la de la caché. Con caché vieja
(otra pestaña) hoy se borra una ruta inexistente, el archivo vigente queda huérfano sin aviso y el reemplazo pisa uno ajeno (*lost update*).

**Pasos (sin migración).**
1. Baja: `eliminarFilaRecurso` hace `.delete().eq('id').select('ruta_archivo').single()` y devuelve la ruta (`null` si es enlace);
   `eliminarRecurso(recurso)` conserva la firma y borra esa ruta, como `normativas`.
2. Reemplazo: `actualizarRecurso(id, cambios, rutaAnterior?: string)` agrega `.eq('ruta_archivo', rutaAnterior)`. Si la fila cambió o ya no
   existe → `PGRST116` → `compensar` borra el archivo nuevo y no toca el viejo (el viejo ya lo borró quien ganó o quien eliminó la fila).
3. `codigosDeError` (`shared/lib/erroresStorage.ts`) suma `code`; `mensajeDeErrorRecurso` traduce `PGRST116` a
   "El recurso cambió o ya no existe. Actualizamos la lista."
4. `useActualizarRecurso`, `useReemplazarArchivo` y `useEliminarRecurso` pasan de `onSuccess` a `onSettled: invalidar`.
5. `docs/arquitectura.md`: quitar la brecha de la ruta de caché en Recursos.

**Tests primero.** `secuencias.test.ts`: la baja borra la ruta devuelta y no la del argumento (el mock la devuelve); enlace no toca Storage;
`:228`/`:232` afirman la ruta anterior; `:239` con `{ code: 'PGRST116' }`. `errores.test.ts` / `erroresStorage` (PGRST116 → mensaje; `code`
en la lista). `useRecursos.test.ts`: invalida también en error.

**Verificación.** `npx vitest run src/features/recursos src/shared/lib` · `npm test` · `npm run lint` · `npm run typecheck` · revisor.
Excepción a 0023 (pediría qa porque toca Storage): solo cambia qué ruta se pasa a `remove()`, sin política ni permiso nuevo; el qa no ve
Storage ni la base y `e2e/recursos.spec.ts` ya cubre baja y reemplazo. Corro `npm run test:e2e` + `npm run db:reset` como regresión.
