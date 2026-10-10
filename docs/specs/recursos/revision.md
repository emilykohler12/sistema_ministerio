# Revisión: recursos (fases A y B)

- **Fecha:** 2026-10-10
- **Revisado:** `git diff main` (sin commitear) y los archivos sin trackear de `feat/recursos`, contra `spec.md` (v2), con `critica.md`
  (crítica de spec con su Respuesta y crítica de código de la fase A) y `notas.md` (desvíos de las fases A y B).
- **Corrido:** `typecheck`, `lint`, `test`, `build` y `test:db` contra la base local. Comparé `database.ts` con
  `supabase gen types --local` y revisé con psql los privilegios reales (`relacl`, `attacl`, `proacl`) y las políticas de `storage.objects`.
  Esta vez no probé por la API: no escribí nada en la base local, que sigue limpia (0 filas en `recurso` y 0 objetos en el bucket).

## Veredicto
**Aprobado.** Los 12 criterios se cumplen y cada uno tiene test. La base y Storage están bien cerrados: RLS, grant de UPDATE por columna,
la RPC invoker con EXECUTE solo para `authenticated`, el bucket privado y las políticas solo para el admin. Las secuencias respetan
el orden y las compensaciones del criterio 7. No encontré fallas de seguridad ni de lógica que bloqueen. Antes del merge queda pendiente
la verificación en el navegador (hallazgo 1). Los demás hallazgos son menores.

## Criterios

| # | Cumple | Evidencia |
|---|---|---|
| 1 | Sí | `archivos.ts:15-54`: tabla `FORMATOS`, tipo y MIME sacados de la extensión, `validarArchivo` (formato y luego tamaño, con el tope inclusivo). `consultas.ts:11-16` sube `new File([file], name, { type: mime })` con `upsert: false`. `secuencias.ts:28-46`. `errores.ts` reconoce 413/415 en `status` o en `statusCode`, y la forma real (`status: 400`, `statusCode: '413'`) tiene test. Tests: `archivos.test.ts` (`.docx` con `type` vacío, `file.type` contradictorio, mayúsculas, 52 428 800 inclusivo), `secuencias.test.ts` (MIME canónico, nombre sin extensión, `file.size`) y `RecursosPage.test.tsx:231-339` (alta, lote de a uno, "subiendo", rechazo por formato y por tamaño sin subir, lote mixto, 413 y 415 del bucket). |
| 2 | Sí | `DialogoRecurso.tsx:12-25`: zod con trim, de 1 a 200, `https://` y hasta 500. `useCrearEnlace` usa tipo `ENLACE` y `max + 1`. Tests: `RecursosPage.test.tsx:348-416` (recortado, http, en blanco, 201 y 501 caracteres) y `useRecursos.test.ts:97-146`. |
| 3 | Sí | `RecursosPage.tsx:252-269`: un archivo guarda `{ nombre }` y un enlace `{ nombre, url }`. No hay forma de cambiar de tipo. `CambiosRecurso` excluye `taller_id`. Tests: `RecursosPage.test.tsx:419-477`. |
| 4 | Sí | `secuencias.ts:49-68`: subir, actualizar solo ruta, tipo y tamaño, y después borrar el anterior. Un enlace se rechaza. Tests: `secuencias.test.ts:160-219` (orden, conserva nombre, orden e id, compensación, `console.warn`) y `RecursosPage.test.tsx:490-536`. |
| 5 | Sí | `ConfirmDialog` y `secuencias.ts:71-74`. Tests: `RecursosPage.test.tsx:539-606` (confirmar, cancelar, enlace sin Storage, huérfano sin alert, falla de la fila sin tocar el archivo). |
| 6 | Sí | Botones Subir/Bajar (`RecursosPage.tsx:184-203`) y la RPC `ordenar_recursos` con la lista completa. Durante el refetch los botones siguen deshabilitados, porque `onSuccess` devuelve la promesa de `invalidateQueries`. Tests: `RecursosPage.test.tsx:609-647` y pgTAP (reordena, intercambio, P0001 en cinco variantes). |
| 7 | Sí | `secuencias.ts` sigue el orden de la spec en los tres flujos. `borrarArchivo` trata `data: []` como falla (`consultas.ts:22-26`), así el `console.warn` no se pierde. Cada compensación tiene test, también la compensación que falla y propaga el error original. |
| 8 | Sí | Migración: `recurso_select` hereda de `taller` y la escritura es solo para el admin. Bucket con `public = false` y políticas `to authenticated` con `es_admin()` para select, insert y delete, sin update ni anon (psql: 3 políticas, todas `{authenticated}`). "Ver" usa `createSignedUrl(ruta, 60)` (`consultas.ts:54-58`). pgTAP: visibilidad por rol y estado; Storage por rol, con el DELETE probado funcionalmente; test de "Ver" en la pantalla. |
| 9 | Sí | `ListaRecursos.tsx`: etiqueta legible, tamaño y total (los enlaces no suman); iframe `youtube-nocookie.com/embed/<id>` con el id validado por regex de 11 caracteres; enlace externo con `target="_blank" rel="noopener noreferrer"`; sin recursos devuelve `null`; sin "Descargar". La URL viene con el CHECK `https://` de la base, así que no entra un `javascript:`. Tests: `TallerDetallePage.test.tsx` (seis casos nuevos). |
| 10 | Sí | `TalleresListPage.tsx:99,112,122-127` (columna y acción) y `TallerFormPage.tsx:135-137` (el alta navega a `/<id>/recursos` con el id que devuelve `guardar_taller`; la edición vuelve a la lista). Tests en los dos archivos. |
| 11 | Sí | `recursos.test.sql`, con 72 asserts que cubren cada viñeta. La crítica de la fase A los revisó contra implementaciones rotas. Las guardias globales pasan. |
| 12 | Sí | Los cinco checks pasan (ver Evidencia). `database.ts` coincide con `supabase gen types --local`, quitando los fines de línea. |

## Seguridad
- No hay clave de servicio en `src/` (grep de `service_role`, `SERVICE_ROLE` y `sb_secret_…`, sin resultados) y en la rama no hay scripts
  del scratchpad.
- Privilegios reales (psql): en `recurso`, anon y authenticated tienen `ardxtm`, sin UPDATE de tabla. El UPDATE por columna es solo de
  `authenticated` y cubre `nombre, tipo, ruta_archivo, url, tamanio_bytes, orden`. `ordenar_recursos` tiene EXECUTE para postgres,
  authenticated y service_role, no para anon ni para PUBLIC. `recurso_id_seq` tiene `rwU` para anon, pero no es explotable: la columna es
  `generated always` (ya está anotado en mi memoria como falso positivo).
- La ruta del objeto la arma la app con un uuid. El CHECK de prefijo impide apuntar al archivo de otro taller, y el admin es de confianza.

## Hallazgos

### Importante
1. **`docs/specs/recursos/notas.md`: la verificación de punta a punta en el navegador (pasos 2 a 4 de la spec) no está hecha ni anotada como
   pendiente.** Es la quinta vez que pasa en el proyecto. `notas.md` registra bien las comprobaciones por script contra la base local
   (forma del error de Storage, `remove()`, embed, RPC y URL firmada), pero no lo que solo se ve en la app. Falta ver que "Ver" abre el
   archivo, porque `window.open` después de un `await` puede caer en el bloqueador de pop-ups, como admite la propia nota. También falta
   ver el iframe de YouTube, que el objeto viejo desaparezca de Studio al reemplazar y que la URL pública del bucket dé error.
   **Recomendación:** hacer los pasos 2 a 4 y anotar el resultado en `notas.md` antes del merge. Queda a cargo del usuario.

### Menor
2. **Las ramas de error de tres mutaciones de la pantalla no tienen test.** Son el alta de enlace y la edición
   (`DialogoRecurso.tsx:74-82`: el diálogo queda abierto y muestra el mensaje) y el reemplazo (`RecursosPage.tsx:135`,
   `onError: avisar`). Están implementadas, pero nada las protege, y es el hueco que se repite en los cortes anteriores.
   **Recomendación:** tres tests con `mockRejectedValue`: `insertarRecurso` y `actualizarRecurso` (el diálogo sigue abierto, con el mensaje
   genérico) y `subirArchivo` con 413 en el reemplazo (alert con el motivo de tamaño).
3. **`RecursosPage.tsx:97-98`: los archivos que se eligen o se sueltan durante un lote en curso se descartan sin aviso.** `elegirArchivos`
   hace `return` si `alta.enCurso`, pero el `FileDropzone` sigue habilitado. **Recomendación:** mostrar un aviso ("Esperá a que termine la
   subida") o deshabilitar el dropzone mientras dura el lote.
4. **`useRecursos.ts:88` y `RecursosPage.tsx:85-90`: si todos los archivos de una nueva selección se rechazan,
   siguen visibles los errores del lote anterior.** Con `validos` vacío, `subir` vuelve antes de reiniciar `estados`, y el alert mezcla
   los motivos nuevos con los errores viejos. **Recomendación:** reiniciar `estados` también con una lista vacía, o no llamar a `subir` y
   limpiar en la pantalla.
5. **`RecursosPage.tsx:289-291`: `Alerta` usa el texto como `key`.** Dos archivos con el mismo nombre y el mismo motivo repiten la clave
   (React avisa y puede mostrar una sola línea). **Recomendación:** usar el índice como `key`. La lista es estática.
6. **`RecursosPage.tsx:6,122`: la pantalla importa `urlFirmada` de `consultas` y lo llama directo.** `.claude/rules/react.md` dice "Datos siempre
   vía hooks … Nada de fetch en componentes". La spec no le asigna un hook a "Ver", así que es un roce con la regla y no un desvío de la spec.
   **Recomendación:** un `useUrlFirmada` (mutation) en `hooks/useRecursos.ts`, o anotar la excepción en `notas.md`.
7. **`docs/arquitectura.md:27`: la fila `descargas` sigue diciendo "sin pantalla que lo use hasta el corte de recursos".** Este corte no
   usa el modal: ahora es el corte descargas. En la fila `talleres`, la definición de `Taller` ("fila + `categoria.nivel_id` + destinatarios + etiquetas")
   no suma los recursos, aunque la frase final los menciona. **Recomendación:** cambiar a "hasta el corte descargas" y sumar "+ recursos".

## Evidencia
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm run lint` (oxlint): 0 errores y 4 warnings, todos previos (`AuthContext`, `DescargaModal`, `TallerFormPage:116` y
  `ConfiguracionPage`). Ninguno sale de archivos de este corte.
- `npm test`: 27 archivos, 361 tests, todos pasan.
- `npm run build`: `✓ built in 2.99s` (`RecursosPage` es un chunk lazy de 11,38 kB).
- `npm run test:db`: 12 archivos, 271 tests, `Result: PASS` (`recursos.test.sql` en ok y las cuatro guardias globales en ok).
- `supabase gen types typescript --local` comparado con `src/shared/types/database.ts`: iguales.
- psql: `recurso.relacl` sin `w` para anon ni authenticated; `attacl` con `authenticated=w` en las 6 columnas editables; `ordenar_recursos.proacl`
  sin anon ni PUBLIC; `pg_policies` de `storage` con 3 políticas `{authenticated}` (SELECT, INSERT y DELETE).
