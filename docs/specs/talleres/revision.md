# Revisión: talleres (fases A y B)

- **Fecha:** 2026-10-10
- **Revisado:** `git diff main` y los archivos sin trackear de la rama `feat/talleres`, contra `spec.md` (v2), con `critica.md`
  (crítica de spec, Respuesta y crítica de código de la fase A) y `notas.md`.
- **Corrido:** `typecheck`, `lint`, `test`, `build` y `test:db` contra la base local. También 30 comprobaciones por la API REST local
  (clave publishable y usuarios del seed) que siguen los pasos 2 a 4 de la verificación de punta a punta a nivel de API, y la
  comparación de `database.ts` con `supabase gen types --local`.

## Veredicto
**Aprobado.** Los 8 criterios se cumplen y cada uno tiene test. Comprobé por la API la RLS, la RPC y los triggers `DA001`/`DA002`.
No encontré fallas de seguridad ni de lógica que bloqueen. Antes del merge queda pendiente una sola cosa: la verificación en el
navegador (hallazgo 1), que `notas.md` deja explícitamente abierta. Los demás hallazgos son menores.

## Criterios

| # | Cumple | Evidencia |
|---|---|---|
| 1 | Sí | Zod en `TallerFormPage.tsx:34-49` (nombre con trim, de 1 a 200; descripción; estado; al menos un destinatario; de 0 a 20 etiquetas de 1 a 100). La RPC es una sola transacción: el pgTAP de atomicidad prueba que con `23503` no quedan ni el taller ni las etiquetas. La auditoría con `usuario_id` tiene pgTAP. Tests de pantalla: alta, edición, nombre en blanco o de 201 caracteres, sin descripción y sin destinatario. Por API: el alta queda auditada. |
| 2 | Sí | La RPC normaliza, inserta y busca en tres sentencias. Por pgTAP, `[' Redes ','redés','REDES']` deja una sola etiqueta, `'Redes'`, y una fila puente. Por API, `['Redes','redés ']` deja `[{"nombre":"Redes"}]`. Las sugerencias salen de la caché (`useEtiquetasSugeridas`, con test). |
| 3 | Sí | Columnas en `TalleresListPage.tsx:98-103`. Baja con `ConfirmDialog` y reactivar a `BORRADOR`, con test de cada uno (también cancelar, borrador, DA002 y error genérico). DELETE como admin por API: `200 []`, no borra. |
| 4 | Sí | DA001 por API: `400 {"code":"DA001","details":"1"}`. DA002 por API, al reactivar (PATCH) y al editar por la RPC. Por pgTAP: crear, publicar, reactivar, mover y la RPC. `CategoriasPage` cuenta solo los no inactivos y muestra el mensaje (con test). El singular "1 taller" es un desvío anotado en `notas.md`. |
| 5 | Sí | `useCatalogo` y `useTallerPublicado` filtran `PUBLICADO` siempre, sin mirar la sesión. Tests de hooks con borradores e inactivos en la caché, que es lo que recibe el admin. El catálogo y el detalle tienen test de borrador, inactivo, id inexistente e id inválido. El nivel se ve en la card y en el detalle. El detalle no ofrece descarga (test). Home usa `useCatalogo`. |
| 6 | Sí | Por API: anon y el usuario sin marca no ven borradores ni sus puentes. `PATCH taller` devuelve 0 filas, `POST etiqueta` 42501 y la RPC de anon 401/42501. `PATCH categoria.nivel_id`: 42501 para anon y para el admin. `PATCH destinatario` como admin: 0 filas. `etiqueta` es de lectura pública. |
| 7 | Sí | `talleres.test.sql` (82 asserts) cubre cada viñeta, incluidas la sincronización por diferencia (con un DELETE auditado) y el vaciado de los puentes. Las guardias globales pasan. |
| 8 | Sí | Los cinco checks pasan (ver Evidencia). No queda `mocks/` en talleres. El grep de `RecursoArchivo`, `TipoRecurso`, `destinatarioLabel`, `responsable` y `descargas` no encuentra nada en el dominio. `titulo` solo aparece como prop de UI (`NoEncontrado`) y en `Normativa`. `database.ts` coincide byte a byte con `supabase gen types --local`. |

## Hallazgos

### Importante
1. **`docs/specs/talleres/notas.md:74-77`: la verificación en el navegador sigue sin hacerse.** Es la cuarta vez que pasa en el
   proyecto. Yo cubrí por API los pasos 2 a 4: el alta con "Redes"/"redés " deja una etiqueta, anon no ve el borrador, al publicar
   lo ve con el nivel, DA001 informa "1", la baja del taller y después la de la categoría pasan, y reactivar da DA002. Falta la
   parte de UI: el mensaje en pantalla, la búsqueda "cuidádos" con la sesión abierta y el filtro por Secundario.
   **Recomendación:** hacer los pasos 2 a 4 en la app y anotar el resultado en `notas.md` antes del merge.

### Menor
2. **`supabase/migrations/20261010034807_talleres.sql:155-213`: `taller_validar_categoria()` y `categoria_validar_baja()` conservan
   EXECUTE para PUBLIC, anon, authenticated y service_role** (`proacl` en la base local). No se puede explotar: una función de
   trigger no se puede llamar directo, y `rpc/taller_validar_categoria` da 404. Pero se aparta del molde de `tocar_updated_at()`
   (`configuracion.sql:18`, que lo revoca y tiene assert). **Recomendación:** en una migración nueva (esta ya va a quedar
   commiteada), `revoke execute ... from public, anon, authenticated, service_role` y un assert como el de `configuracion.test.sql:51`.
   También sirve dejarlo anotado como aceptado.
3. **Criterio 7, "EXECUTE de `guardar_taller` solo para `authenticated`".** `service_role` también lo tiene (`proacl`) y el pgTAP
   solo revisa anon y authenticated. No es un riesgo, porque service_role saltea la RLS igual. **Recomendación:** sumar
   `service_role` al `revoke` o aclarar en el criterio que es "no anon ni PUBLIC".
4. **`src/features/talleres/errores.ts:15-16`: con un `DA001` cuyo `details` es `null` (lo que manda PostgREST cuando no hay
   detail), `Number(null)` da `0`.** La pantalla diría "tiene 0 talleres…", y `notas.md` afirma que cae al mensaje genérico. Hoy no
   puede pasar, porque el trigger siempre manda el detail. **Recomendación:** tratar `details` que no sea un string no vacío como
   `null` y sumar el caso al test.
5. **`src/pages/admin/talleres/TallerFormPage.tsx:76`: la rama `tallerRuta.isError` en modo edición no tiene test.** La rama
   evita mostrar un formulario vacío que pise los datos al guardar, el mismo hueco de cortes anteriores. Está implementada, pero
   nada la protege. **Recomendación:** un test con `obtenerTalleres` rechazado en `/3/7/5/editar` que espere el alert y no
   "Guardar cambios".
6. **`src/pages/admin/talleres/CategoriasPage.tsx:30-32`: si falla la carga de talleres, cada tarjeta dice "0 talleres" sin aviso.**
   No afecta la regla, porque DA001 la sostiene la base, pero el número es falso. **Recomendación:** si `talleres.isError`, no
   mostrar el conteo (o mostrar "—").

### Nota operativa (no es del código)
Para las comprobaciones por API creé datos en la base local: la categoría "Salud mental", dos talleres, la etiqueta "Redes" y sus
filas de `registro_operacion`. El clasificador de permisos me bloqueó el borrado posterior. Con esos datos, `test:db` falla por
contaminación (6 asserts de `niveles_categorias` y varios de `talleres`), porque los pgTAP asumen una base sin categorías. Antes de
mis pruebas corrió en verde (198/198). **Hay que correr `npm run db:reset`** (base local) para volver al estado limpio.

## Evidencia
- `npm run typecheck`: exit 0, sin errores.
- `npm run lint`: exit 0, 0 errores y 4 warnings. Uno es nuevo, `react(incompatible-library)` en `TallerFormPage.tsx:116` (`watch` de
  RHF), igual a los de `ConfiguracionPage` y `DescargaModal`.
- `npm test`: 22 archivos, 236 tests, todos pasan.
- `npm run build`: `✓ built in 3.16s`.
- `npm run test:db` (antes de las pruebas por API): 11 archivos, 198 tests, `Result: PASS` (`talleres.test.sql` con 82 y
  `niveles_categorias.test.sql` con 33).
- API REST local, resultados clave: la RPC de anon da `401 42501 permission denied for function guardar_taller`. La RPC sin marca
  da `403 42501` (RLS de `taller`), y su edición `P0002`. `PATCH categoria {nivel_id}` como admin: `403 42501`. La baja de la
  categoría con un borrador: `400 DA001 details "1"`. Reactivar en una categoría inactiva: `400 DA002`. anon con el taller
  publicado recibe `categoria{nivel_id:3}`, destinatarios y etiquetas por embed. Con la categoría inactiva, anon recibe `[]`.
