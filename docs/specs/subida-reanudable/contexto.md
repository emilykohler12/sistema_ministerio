# Contexto: subida reanudable y barra de progreso (#29)

Hechos del código al 2026-11-10 (informe de `Explore`). Sin diseño propuesto.

## 1. Flujo actual de subida
- `src/shared/lib/storage.ts:7-12` `subirArchivo(bucket, ruta, file, mime)`: `supabase.storage.from(bucket).upload(ruta, new File([file], file.name, {type: mime}), {upsert:false})`. Es un POST único del archivo entero, sin progreso. storage-js ignora `contentType` con un `File` (por eso el MIME viaja en un `File` nuevo).
- `storage.ts:18-22` `borrarArchivo` (`data: []` cuenta como falla), `:25-35` `borrarOAvisar` (solo `console.warn`), `:41-63` `compensar` y `esRechazoDelServidor`: compensa solo si el error trae `code` no vacío; con `code ''` o `status 0` solo avisa.
- `src/features/recursos/consultas.ts:6-15`: wrappers con `BUCKET='talleres'`; `urlFirmada` firma por 60 s (l.53).
- `src/features/recursos/secuencias.ts`: `altaArchivo` (l.23-41: `rutaNueva` → `subirArchivo` → `insertarRecurso`; si el insert falla, `compensar`), `reemplazarArchivo` (l.44-64: sube el nuevo → actualiza la fila → `compensar` si falla → `borrarOAvisar(anterior)`), `eliminarRecurso` (l.70-73). Comentario del invariante en l.9-13.
- `archivos.ts`: `TAMANIO_MAXIMO = 52_428_800` (l.4), `FORMATOS` (pdf, pptx, docx, jpg, jpeg, png, webp, mp4), `validarArchivo` (l.50-54), `rutaNueva` = `<tallerId>/<uuid>.<ext>` (l.57-59).
- `hooks/useRecursos.ts`: `useReemplazarArchivo` (l.44-50, `useMutation`, invalida `CLAVE_TALLERES` en `onSettled`); `useAltaArchivos` (l.88-120) con `estados: EstadoArchivo[]` (`'esperando'|'subiendo'|'listo'|'error'` + `motivo`, tipo en l.77-81) y `enCurso`; sube el lote **de a uno, en orden**; un error no corta el lote; invalida una sola vez en el `finally`.
- No hay diálogo de subida de archivos: `DialogoRecurso` solo sirve para enlaces nuevos y para renombrar o editar la URL.
- `src/pages/admin/talleres/RecursosPage.tsx`: `FileDropzone multiple` (l.148-154) → `elegirArchivos` (avisa «Esperá a que termine…» si `alta.enCurso`, valida con `validarArchivo`, llama a `alta.subir`). Estado de carga (l.155-163): `<ul aria-live="polite">` con «`{nombre}: Subiendo…`» o «En espera», **sin porcentaje ni barra**. Errores con `Alerta` (`role="alert"`). `ocupado` (l.87) = `alta.enCurso || ordenar.isPending || eliminar.isPending || reemplazar.isPending`. Reemplazar (l.130-138) usa `reemplazar.mutate` sin estado visible de progreso.
- **No existe cancelación**: ni `AbortController`, ni `AbortSignal`, ni `beforeunload` en `src/`. Salir de la página o cerrar la pestaña corta el POST sin aviso; la fila se inserta recién después de subir, así que no queda fila (puede quedar un objeto huérfano, o ninguno si el POST se cortó).
- UI existente: no hay componente Progress ni Spinner en `src/shared/components/ui/`. `FileDropzone.tsx` no tiene prop `disabled`.

## 2. Cómo se prueba hoy
- `secuencias.test.ts` mockea `./consultas` (`altaArchivo` l.102-161, falla ambigua l.163-195, `reemplazarArchivo` l.197-273, `eliminarRecurso` l.275-320).
- `RecursosPage.test.tsx` mockea `subirArchivo` e `insertarRecurso`; «mientras sube muestra el estado subiendo» (l.274-285) deja `subirArchivo` pendiente y busca `/subiendo/i`; rechazos 413/415 (l.322-340).
- `e2e/recursos.spec.ts`: un test largo; sube un PDF por `input[type=file]` (l.27) y reemplaza con uno de 5000 bytes (l.59). Sin archivos grandes ni progreso.
- pgTAP: `supabase/tests/recursos.test.sql` (bucket privado, `file_size_limit = 52428800`, MIME) y `storage_global.test.sql` (toda política de escritura de `storage.objects` es de `authenticated` y exige `es_admin`).

## 3. Storage
- Migración `20261010044500_recursos.sql:133-172`: bucket `talleres` privado, `file_size_limit=52428800`, 7 MIME; políticas `talleres_objetos_select_admin`, `_insert_admin`, `_delete_admin` (`to authenticated`, `bucket_id='talleres' and es_admin()`); sin update. Anon lee vía `talleres_select_anon` (migración de descargas).
- `@supabase/supabase-js` y `@supabase/storage-js` 2.117.3. storage-js trae `createSignedUploadUrl` y `uploadToSignedUrl`; **no** trae `XMLHttpRequest`, `onUploadProgress` ni TUS/`resumable`. `tus-js-client` y `uppy` **no** están en `package.json` ni en `node_modules`.

## 4. `supabase/config.toml`
- `[storage]` (l.117-120): `enabled = true`, `file_size_limit = "50MiB"`; `[storage.s3_protocol] enabled = true` (l.130). Sin mención de TUS/resumable. Los buckets se crean por migración.

## 5. Compensación y subida en trozos
- ADR 0016: invariante «ninguna fila apunta a un archivo inexistente»; orden fijo de operaciones; compensa solo ante rechazo del servidor con `code`; el huérfano es el único fallo aceptado y su limpieza es `npm run storage:limpiar` (#28).
- Hoy la subida es atómica para el cliente: hay objeto o no. En trozos hay que decidir qué hacer con un upload incompleto. Los errores de TUS no tienen la forma `code`/`status` que espera `esRechazoDelServidor`.
- `scripts/limpiar-storage.ts`: `listarBucket` usa `storage.list` y filtra `id !== null`. Un upload TUS incompleto no se vuelve objeto hasta completarse; **no verificado** si `list` lo muestra.

## 6. Accesibilidad y reglas
- `.claude/rules/react.md`: textos en español rioplatense; foco visible y teclado; un `role="status"`/`role="alert"` que se monta ya con su texto no se anuncia de forma confiable (siempre montado, o `tabIndex={-1}` con foco en un efecto, más test `toHaveFocus()`); carga con `isPending`; `key` estable.
- `.claude/rules/datos.md`: una mutación no mezcla escritura y lectura; hooks delgados sobre `consultas`; lo genérico en `src/shared/lib/`; supabase-js devuelve `{error}` pero también lanza.
- Patrones de estado: `aria-live="polite"` en la lista de subida, `role="alert"` en `Alerta`, `role="status" aria-label="Cargando"` en `Skeleton`, `AvisoInactividad` con `role="timer"` y un `status` que solo cambia en hitos.
