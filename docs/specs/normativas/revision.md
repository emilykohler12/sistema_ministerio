# Revisión fase A

Revisor, 2026-10-10. Se revisó el cambio sin commitear de `feat/normativas` contra `main`: las dos migraciones, los tres pgTAP nuevos,
`database.ts` (generado) y `definicion-dam.md` §8.3. Se tomaron como referencia `spec.md` (Fase A y criterios 1, 3, 4, 7 y 8),
`critica.md` (respuestas aceptadas) y `notas.md`. Los privilegios se comprobaron con psql sobre la base local, y las pruebas que escriben
corrieron dentro de `begin ... rollback`.

## Veredicto
**Aprobado.** No hay hallazgos bloqueantes ni importantes. Las cinco observaciones de abajo son menores y se pueden resolver ahora o en la
fase B.

## Cobertura de la spec

| Requisito | Implementación | Test |
|---|---|---|
| `resolver_etiquetas` extraída, invoker, EXECUTE solo para `authenticated` (crítica 1) | `..._resolver_etiquetas.sql:12-60`. `guardar_taller` conserva la firma y los grants (proacl verificado) | `resolver_etiquetas.test.sql` (12) y `talleres.test.sql` en verde |
| Crit. 1: unicidad de número y año, normalizada | `normativas.sql:148-149`. La RPC guarda `btrim(numero)` | `normativas.test.sql:141-148, 425-434, 501-506` |
| CHECK de título y número no vacíos, año, formato de ruta, `unique` | `normativas.sql:136-140` | `:121-168` |
| Crit. 3: ruta nula conserva el archivo, se devuelve `ruta_anterior` con `for update` y `descargas` se conserva | `normativas.sql:279-298` | `:448-490` |
| Crit. 4: la baja borra la fila y el puente, y las etiquetas quedan | FK con cascada `:191` y etiqueta sin cascada `:192` | `:525-534` |
| Crit. 7: el contador no audita ni toca `updated_at`; alta, edición (también sin cambios) y baja auditan; `set descargas` del admin da 42501 | Dos triggers con `WHEN` (`:224-238`) y grant por columna (`:182-183`) | `:311-317, 368-378, 573-614` |
| Crit. 8: anon (DML en las dos tablas, EXECUTE) y escritura del bucket solo del admin | RLS `:152-217`, grants `:320-343`, políticas de Storage `:356-372` | `:244-317, 319-362, 536-571` |
| Guardia global de Storage, con autoverificación (crítica 4) | n/a | `storage_global.test.sql` (5): cubre anon, `authenticated` sin `es_admin`, `for all` y que se ignore `select` |
| Bucket público de 20 MiB, solo PDF y sin política de update | `normativas.sql:349-350` | `:210-234, 544-547` |

Privilegios reales (psql): `normativa` → anon y authenticated `ardxtm`, sin `w` de tabla. `authenticated` tiene `w` por columna solo en
`titulo, descripcion, numero, anio, ruta_archivo`. `guardar_normativa` y `resolver_etiquetas` dan EXECUTE solo a postgres, authenticated y
service_role. `contar_descarga_normativa` además a anon; es `prosecdef` y su dueño es `postgres`. Sin grant a PUBLIC.

## Hallazgos

- **[menor]** `supabase/migrations/20261010155300_normativas.sql:228-238`. El `WHEN (old.descargas = new.descargas)` deja sin auditar
  y sin mover `updated_at` **cualquier** UPDATE que además cambie `descargas`, no solo el del contador. Desde la API no se puede explotar,
  porque `descargas` no tiene grant para authenticated. Pero `service_role` y `postgres` sí pueden: **verificado** en rollback,
  `update normativa set titulo = 'cambiado', descargas = descargas + 1` como `service_role` deja 0 filas en `registro_operacion`.
  Esto choca con definición §9 ("la auditoría se cumple sin importar desde dónde llegue el cambio"). Hoy nada usa `service_role` sobre esta
  tabla. **Recomendación:** en una migración nueva, ampliar los dos `WHEN` a
  `old.descargas = new.descargas or (old.titulo, old.descripcion, old.numero, old.anio, old.ruta_archivo) is distinct from (new.titulo, new.descripcion, new.numero, new.anio, new.ruta_archivo)`
  y sumar un assert. Si no, aceptarlo y anotarlo como desvío en `notas.md`.
- **[menor]** `supabase/tests/normativas.test.sql:269` y `:338`. `update normativa_etiqueta set etiqueta_id = etiqueta_id` no puede
  fallar de forma visible. Si una política futura habilitara el UPDATE, la fila quedaría igual y ningún assert lo notaría, así que la
  parte "update en `normativa_etiqueta`" del criterio 8 no está verificada de verdad. **Recomendación:** asignar otro `etiqueta_id`
  existente y verificar el puente, o pedir 0 filas `UPDATE` de `tabla = 'normativa_etiqueta'` en `registro_operacion`.
- **[menor]** `supabase/migrations/20261010155300_normativas.sql:185-217`. La spec (`spec.md:54`) dice "insert, update y delete solo del
  admin" para el puente, pero no hay política de UPDATE: un UPDATE del admin afecta 0 filas. `notas.md` lo justifica (molde de
  `taller_etiqueta`, la PK es toda la fila) y es inocuo, porque la RPC sincroniza borrando e insertando. Como contradice el texto de la
  spec, conviene pasarlo de "Decisiones menores" a "Desvíos" en `notas.md`, o ajustar la spec.
- **[menor, para la fase B]** `src/shared/types/database.ts`. `db:types` tipa `guardar_normativa` como `ruta_anterior: string` (en un
  alta es `null`) y `p_descripcion: string` (la columna admite null). Esto pasa porque typegen pierde la nulabilidad de `RETURNS TABLE` y
  de los parámetros sin default. En `consultas.ts` hay que tratar `ruta_anterior` como `string | null`. Si no, el reemplazo puede intentar
  `remove([null])` o comparar mal con la ruta nueva.
- **[menor]** `docs/arquitectura.md`. No se actualizó. La sección "Base de datos" no lista `<ts>_resolver_etiquetas.sql` ni
  `<ts>_normativas.sql`, la de guardias no menciona `storage_global` y "Brechas" sigue diciendo "faltan las tablas de normativas… el bucket
  de normativas" y "al sumar el bucket público de normativas, agregar una guardia global de Storage", que esta fase ya resuelve. Si la
  fase A va en un PR propio, actualizarla ahí. Si no, al cerrar la fase B.

Sin hallazgos en:
- `contar_descarga_normativa`: es definer con `search_path = ''`, un id inexistente o nulo no hace nada y no tiene grant a PUBLIC.
- `guardar_normativa`: es invoker, es atómica (un alta rechazada no deja etiquetas), el `for update` serializa los reemplazos y alcanza con
  el grant por columna.
- Las RLS de las dos tablas.
- Las políticas de `storage.objects` (`to authenticated` con `es_admin()`, sin update ni anon).
- Las guardias globales (`rls`, `auditoria`, `truncate`, `updated_at`), que siguen en verde.
- El refactor de `guardar_taller`, que mantiene el mismo comportamiento. Solo cambia el texto de un error interno, y está documentado.

Fuera de alcance, sin cambios de código: las memorias de `.claude/agent-memory/critico/`.

## Evidencia

```
$ npm run db:reset
Applying migration 20261010155216_resolver_etiquetas.sql...
Applying migration 20261010155300_normativas.sql...
Finished supabase db reset on branch feat/normativas.

$ npm run test:db
auditoria_global .. ok   normativas ........ ok   resolver_etiquetas .. ok
configuracion ..... ok   recursos .......... ok   rls_global .......... ok
es_admin .......... ok   registro_operacion  ok   storage_global ...... ok
funciones ......... ok   talleres .......... ok   truncate_global ..... ok
niveles_categorias  ok                            updated_at_global ... ok
All tests successful.  Files=15, Tests=394  Result: PASS

$ npm run typecheck      # tsc -b, sin errores
$ npm run lint           # oxlint: 0 errores, 4 warnings previos (AuthContext, ConfiguracionPage, DescargaModal, TallerFormPage)
$ npm test               # Tests 377 passed (377)
```

psql (sin escribir): `relacl`, `attacl` y `proacl` de `normativa`, `normativa_etiqueta` y las cuatro funciones; `pg_get_triggerdef` de
los cuatro triggers y `pg_policies` de las dos tablas y del bucket. Coinciden con la spec. Prueba del hallazgo 1 dentro de
`begin ... rollback`: la base quedó limpia.

## Respuesta (fase A)
1. **Acepto.** Se amplía el `WHEN` (ver la respuesta 3 de la crítica de código) en la misma migración, que todavía no está en `main`.
   Se agrega un test con un UPDATE de contador más título hecho por un rol con bypass (`postgres`/`service_role`) que sí audita.
2. **Acepto.** El test del UPDATE del puente se cambia por uno que intenta cambiar `etiqueta_id` a otra etiqueta y verifica que no
   cambió nada.
3. **Acepto.** Se mueve a "Desvíos" en `notas.md`.
4. **Acepto para la fase B.**
5. **Acepto al cerrar la feature** (`arquitectura.md` se actualiza una sola vez, después de la fase B).

# Revisión fase B

Revisor, 2026-10-10. Revisé el frontend sin commitear de `feat/normativas` contra `main`: `shared/lib/storage.ts`, `botonClases`,
`features/etiquetas/`, `features/normativas/`, el refactor de `recursos` y `talleres`, las cuatro pantallas y todos sus tests. Las
referencias fueron `spec.md` (criterios 1-6 y 9, y el diseño de la fase B), `critica.md` (spec, fase A y fase B), `notas.md` y la revisión de
la fase A (punto 4: `ruta_anterior` tipada como `string | null`, que quedó resuelto en `normativas/types.ts:181-185` y `consultas.ts:34-43`).
Además corrí un script de supabase-js contra la base **local** (admin del seed, `supabase status -o json` por stdin, sin imprimir claves).
Limpió todo lo que creó con la service role local: quedaron 0 normativas, 0 etiquetas y 0 objetos en el bucket, y `test:db` sigue en verde.

## Resumen
**Aprobado.** No hay hallazgos bloqueantes. Cada criterio del alcance de la fase B (1-6 y 9) está implementado y tiene test. El camino
real de punta a punta funciona contra la base local (27/27 comprobaciones): subida, 413 y 415 del bucket, `guardar_normativa` (alta,
duplicado, edición con y sin archivo), URL pública que abre sin `attachment`, contador sin auditoría y baja. Hay un hallazgo importante: la
verificación en el navegador que pide la spec sigue pendiente. Los menores son huecos de tests y de casos borde.

## Cobertura de la spec

| Criterio | Implementación | Test |
|---|---|---|
| 1. Alta con PDF; duplicado de número y año con mensaje y archivo compensado | `secuencias.ts:26-36`, `errores.ts:21-23`, `NormativaFormPage.tsx:99-116` | `NormativaFormPage.test.tsx:113,147`, `secuencias.test.ts:100-151`. Por API: 23505 con `'77/e2e'` contra `'  77/E2E '` |
| 2. zod: título 1-200, número 1-50, año 1900-2100, PDF de hasta 20 MiB; 413/415 con el mismo mensaje | `NormativaFormPage.tsx` (`crearSchema`), `archivos.ts:8-14`, `errores.ts:24-26` | `NormativaFormPage.test.tsx:176-301` (bordes 200/201, 50/51, 1899/1900/2100/2101), `archivos.test.ts`, `errores.test.ts`. Por API: el bucket da `statusCode` 413 y 415 |
| 3. Edición: sin archivo conserva la ruta de la base; con archivo, sube, guarda y borra la `ruta_anterior` de la RPC; `descargas` se conserva | `secuencias.ts:42-54` (recibe solo el `id`, no la caché) | `NormativaFormPage.test.tsx:315,335`, `secuencias.test.ts:153-237`. Por API: `ruta_anterior` es null sin archivo y es la vieja al reemplazar; `descargas` no cambia |
| 4. Baja con confirmación: fila y después archivo; las etiquetas quedan | `secuencias.ts:57-60`, `NormativasAdminPage.tsx:21-25` | `NormativasAdminPage.test.tsx:83-145`, `secuencias.test.ts:239-258`. Por API: la etiqueta sigue después de la baja |
| 5. Búsqueda en título, número, descripción y etiquetas, sin tildes; orden año desc e id desc; tres en la Home | `filtrar.ts`, `useNormativas.ts:20-22`, `HomePage.tsx:27` | `filtrar.test.ts`, `useNormativas.test.ts:97-129`, `NormativasPublicPage.test.tsx:66-112`, `HomePage.test.tsx:65` |
| 6. `<a target="_blank">`; el contador va sin `await`, una vez por normativa (`sessionStorage`) y si falla no interrumpe | `EnlaceDescarga.tsx`, `useNormativas.ts:56-75` | `useNormativas.test.ts:237-296`, `NormativasPublicPage.test.tsx:114-166`. Por API: anon cuenta +1, sin fila de auditoría y sin cambiar `updated_at` |
| 9. Sugerencias desde la tabla `etiqueta`, compartidas; las mutaciones invalidan `['etiquetas']` | `features/etiquetas/`, `useTalleres.ts:45-49`, `useNormativas.ts:40-44` | `useEtiquetas.test.ts`, `useTalleres.test.ts:192-217`, `TallerFormPage.test.tsx:821`, `NormativaFormPage.test.tsx:139` |
| Diseño: `shared/lib/storage.ts` con el bucket como parámetro; `esRechazoDelServidor` privado; `recursos` en verde | `storage.ts`, `recursos/{consultas,secuencias}.ts` | `storage.test.ts` (los seis casos de `esRechazoDelServidor` vía `compensar`) y los tests de `recursos` sin cambios |
| Diseño: `anio` numérico, sin "responsable", botón "Guardar", archivo actual visible, `?editar=` inválido da "no encontrado" | `NormativaFormPage.tsx:58-72,181-194` | `NormativaFormPage.test.tsx:105,304,349,355` |

Seguridad: no hay secretos en `src/`. Ninguna página importa `consultas`, y la clave de servicio solo se usó en el script local. La escritura
del bucket y de la tabla queda en manos de la RLS y de Storage, y lo verifiqué por API: anon no puede subir, y el admin recibe 42501 al
hacer `update ... set descargas`. Fuera del alcance de la spec solo cambió `Button.tsx`, que pasó sus clases a `botonClases.ts`. Es
necesario para `EnlaceDescarga` y no cambia el comportamiento.

## Hallazgos

- **[importante]** `docs/specs/normativas/notas.md:129`. La verificación de punta a punta en el navegador (spec, pasos 2 y 3: alta con una
  etiqueta sugerida de un taller, duplicado, editar con y sin archivo, eliminar, buscar sin tildes y pulsar "Descargar" dos veces) sigue
  "pendiente". Esta vez quedó anotada, pero la spec la exige. Mi script cubre la mitad del servidor (RPC, bucket, contador y auditoría), pero
  no el navegador: que el `<a>` abra la pestaña, que `sessionStorage` evite el segundo conteo y que el `FileDropzone` entregue el `File`
  real. **Recomendación:** hacerla antes del PR y anotar el resultado en `notas.md`, incluido `normativa.descargas` y el conteo de
  `registro_operacion` antes y después de las dos pulsaciones.
- **[menor]** `src/pages/admin/normativas/NormativaFormPage.tsx:69`. La rama de error de carga en la edición (`isError` → `ErrorFallback`,
  que impide guardar un formulario vacío sobre datos reales) está bien implementada, pero no tiene test. Es el mismo hueco que en talleres.
  **Recomendación:** un test con `obtenerNormativas.mockRejectedValue` en `?editar=5` que espere el botón de reintentar y que no aparezca
  el campo "Título".
- **[menor]** `src/features/normativas/secuencias.ts:57-60`. La baja borra `normativa.ruta_archivo` de la caché (es el punto 2 de la crítica
  de la fase B). Si otro admin reemplazó el PDF, el borrado del archivo viejo da `data: []` (avisa) y el archivo vigente queda huérfano. No
  rompe 0016 (la fila se borra primero), pero contradice la regla del criterio 3 ("la de la base, no la de la caché").
  **Recomendación:** lo que propone el crítico, `.delete().eq('id', id).select('ruta_archivo').single()`, y borrar esa ruta.
- **[menor]** `src/pages/public/NormativasPublicPage.tsx:24`, `src/pages/public/HomePage.tsx:119` y
  `src/pages/admin/normativas/NormativasAdminPage.tsx:43`. Usan `isLoading`. Con la red caída en la primera carga, la query queda
  `paused` (`isLoading` y `isError` en falso) y la sección no muestra nada. Antes daba igual porque eran mocks; ahora es red real. En la
  misma `HomePage` los talleres ya usan `isPending` (líneas 91 y 154). **Recomendación:** pasar a `isPending`, como en el catálogo de talleres.
- **[menor]** `src/features/normativas/components/EnlaceDescarga.tsx:16`. Solo `onClick` cuenta: abrir con el botón del medio del mouse
  (`auxclick`) abre el PDF sin contar. Es un caso borde del criterio 6 ("cuando pulsa Descargar"). Ctrl+clic y Enter sí disparan `click`.
  **Recomendación:** si importa la exactitud del contador, sumar `onAuxClick` con `button === 1`. Si no, dejarlo anotado en `notas.md`.
- **[menor, accesibilidad]** `src/pages/admin/normativas/NormativaFormPage.tsx:181,211`. `<Label>Archivo</Label>` no está asociado a ningún
  control (el nombre accesible del input es "elegilo") y el error `archivo-error` no se vincula con `aria-describedby` ni marca
  `aria-invalid`. Un lector de pantalla no anuncia el motivo del rechazo junto al control (el `role="alert"` sí se anuncia).
  Viene del patrón previo de `FileDropzone`. **Recomendación:** que `FileDropzone` acepte `id` y `aria-describedby`, o dejarlo para
  cuando se revise ese componente.

Sin hallazgos en:
- Las secuencias de alta y reemplazo: siguen el orden de 0016, compensan solo ante un rechazo del servidor y borran solo la `ruta_anterior`
  no nula.
- `guardarNormativa`: un único cast, la primera fila del `RETURNS TABLE` y `?? null`.
- `mensajeDeErrorNormativa`: 23505, y 413/415 en `status` o `statusCode`. Lo verifiqué contra el storage-api local.
- `useContarDescarga`: marca antes de llamar y absorbe el rechazo sin que quede un rechazo sin atender (test con `unhandledRejection`).
- La invalidación de `['etiquetas']`, que pasa solo ante un éxito.
- `NormativaFormPage`: con id inválido o inexistente muestra "no encontrado", y el formulario de edición no se muestra hasta que hay datos.
- El refactor de `recursos`, con texto idéntico y tests en verde.
- `docs/arquitectura.md`, que ya se actualizó durante esta revisión (resuelve el punto 5 de la fase A).

## Evidencia

```
$ npm test
 Test Files  38 passed (38)
      Tests  499 passed (499)

$ npm run typecheck      # tsc -b, sin errores
$ npm run lint           # oxlint: 0 errores, 4 warnings previos (DescargaModal, TallerFormPage, ConfiguracionPage, AuthContext)
$ npm run build          # ✓ built in 3.37s

$ npm run test:db        # antes y después del script
All tests successful.  Files=15, Tests=398  Result: PASS
```

Script de supabase-js contra la base local (scratchpad, `e2e-normativas.mjs`), 27 OK y 0 fallas:
- el admin sube un PDF; el bucket rechaza `text/plain` (415) y 20 MiB + 10 B (413) en `status`/`statusCode`; anon no puede subir;
- `guardar_normativa`: el alta da `ruta_anterior` null, el número `'  77/E2E '` se guarda recortado y `'77/e2e'` del mismo año da 23505;
- anon lee `select('*, etiqueta(*)')` con la etiqueta embebida, como `obtenerNormativas`;
- `getPublicUrl` sin sesión da 200, `application/pdf` y sin `Content-Disposition: attachment`;
- `contar_descarga_normativa` como anon suma +1, sin filas nuevas en `registro_operacion` y sin tocar `updated_at`; con un id inexistente
  no da error; el admin recibe 42501 en `update set descargas`;
- la edición sin archivo da `ruta_anterior` null y conserva la ruta; con archivo devuelve la vieja, `remove()` la borra (`data.length` 1) y
  `descargas` se conserva;
- la baja `.delete().select('id').single()` y `remove()` funcionan, y la etiqueta queda.
- Limpieza con la service role local: 0 normativas, 0 etiquetas y 0 objetos en `normativas`.

## Respuesta (fase B)
- **Verificación en el navegador:** no tengo navegador en este entorno. Queda como paso manual del usuario antes del PR y lo anoto en el
  resumen. El script de supabase-js cubre la parte de datos.
- **Test de error de carga en la edición:** acepto.
- **Baja con la ruta de la base:** acepto (crítica, punto 2).
- **`isLoading` → `isPending`:** acepto. Sin red, la pantalla quedaría vacía.
- **`onAuxClick` en `EnlaceDescarga`:** acepto, cuesta una línea.
- **Accesibilidad del campo "Archivo":** acepto (`htmlFor`/`id`, `aria-invalid`, `aria-describedby`).
