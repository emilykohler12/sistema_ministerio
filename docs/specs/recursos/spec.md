# recursos: cuarto corte vertical (recursos + Storage)

- **Estado:** implementada (v2, en `feat/recursos`); falta la verificación manual (pasos 2 a 4)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-10

## Objetivo
Pasar los recursos de los talleres a Supabase (0012): la tabla `recurso` y el bucket privado `talleres` de Storage, para que el admin cargue,
renombre, ordene, reemplace y elimine archivos y enlaces, y el portal muestre la lista de recursos de cada taller publicado (tipo, tamaño,
videos de YouTube integrados). **Sin descarga pública**: la Edge Function `descargar-taller`, el formulario y `registro_descarga` son el corte
siguiente (descargas, 0006 y 0010). Contexto: `contexto.md`.

## Criterios de aceptación
1. **Alta de archivos.** En la pantalla de recursos del taller el admin elige uno o varios archivos (PDF, PPTX, DOCX, imagen JPG/PNG/WebP o MP4,
   hasta 50 MiB = 52 428 800 bytes cada uno). Cada archivo se sube al bucket `talleres` y queda como un recurso al final de la lista, con nombre =
   nombre del archivo sin extensión. **El tipo y el MIME salen de la extensión**, no del `file.type` del navegador (en Windows sin Office un
   `.docx` puede llegar con tipo vacío), y se sube con el MIME canónico. Un archivo de otra extensión o más grande se rechaza antes de subir, con
   el motivo; si igual llega a Storage, el bucket lo rechaza (413/415) y la pantalla muestra el mismo motivo.
2. **Alta de enlaces.** El admin agrega un enlace con nombre (obligatorio, recortado, hasta 200) y URL `https://` (hasta 500). Tipo `ENLACE`.
3. **Edición.** Renombrar cualquier recurso; cambiar la URL de un enlace. No se convierte un archivo en enlace ni al revés (se elimina y se crea).
4. **Reemplazo** (solo archivos): sube el archivo nuevo, actualiza el recurso (ruta, tipo y tamaño) y elimina el archivo anterior de Storage.
   Conserva nombre, orden e id.
5. **Eliminación** (con confirmación): borra la fila y el archivo de Storage (§5.3, baja física).
6. **Orden.** Botones "Subir" / "Bajar" por fila. El nuevo orden se guarda en una sola operación atómica.
7. **Consistencia base ↔ Storage** (no hay transacción común). Invariante: **ninguna operación de la app deja una fila apuntando a un archivo
   que no existe**. Lo sostiene el orden de las operaciones (la base no lo verifica; ver `critica.md` punto 1). Se acepta, como único modo de
   falla, un archivo huérfano en Storage (sin fila) si falla una compensación. Orden de operaciones:
   - alta: subir → insertar fila; si el insert falla, borrar el archivo subido y propagar el error;
   - reemplazo: subir el nuevo → actualizar fila; si el update falla, borrar el nuevo; si sale bien, borrar el anterior;
   - eliminación: borrar fila → borrar archivo. Si falla el borrado del archivo, la operación se informa como exitosa (el recurso ya no existe)
     y el huérfano se registra con `console.warn`.
8. **Visibilidad.** anon y authenticated sin la marca leen los recursos de talleres publicados (y no escriben nada); el admin lee y escribe todos.
   La baja del taller oculta sus recursos (hereda la RLS de `taller`). En Storage, **solo el admin** lee, sube y borra objetos del bucket
   `talleres`; anon no lee ningún objeto (los enlaces firmados públicos llegan con la Edge Function del corte descargas).
   El admin puede abrir un archivo desde el panel ("Ver", enlace firmado de 60 s).
9. **Portal** (`/talleres/:id`): sección "Recursos" con nombre, tipo (etiqueta legible) y tamaño de cada archivo, y el tamaño total. Los enlaces
   de YouTube se muestran integrados con `https://www.youtube-nocookie.com/embed/<id>` (0009); otros enlaces, como enlace externo
   (`target="_blank" rel="noopener noreferrer"`). Sin recursos, la sección no aparece. Sin botón "Descargar" (corte descargas).
10. **Panel.** `TalleresListPage` suma la columna "Recursos" (cantidad) y la acción "Recursos". Tras dar de **alta** un taller se navega a su
    pantalla de recursos (la edición sigue volviendo a la lista).
11. **pgTAP** (`supabase/tests/recursos.test.sql`):
    - visibilidad de `recurso` por rol y estado del taller; INSERT/UPDATE/DELETE anon y sin marca → `42501` o 0 filas;
    - CHECK archivo xor enlace (los cuatro casos inválidos → `23514`), `url` sin `https://` → `23514`, `ruta_archivo` fuera de `<taller_id>/` → `23514`,
      `tamanio_bytes = 0` → `23514`;
    - `update recurso set taller_id` → `42501`; `ordenar_recursos` reordena, solo audita filas cambiadas, falla si la lista no coincide
      con los recursos del taller, EXECUTE solo `authenticated`; llamada por authenticated sin marca → no cambia nada (la RLS deja 0 filas);
    - bucket `talleres`: `public = false`, `file_size_limit = 52428800`, `allowed_mime_types` exactos;
    - `storage.objects` del bucket: admin inserta y lee; anon y sin marca no leen ni insertan (`42501` o 0 filas);
    - FK `taller_id` sin cascada; auditoría con `sub`; `updated_at`. Guardias globales en verde.
12. Pasan `typecheck`, `lint`, `test`, `build` y `test:db`.

## Diseño
Un PR en dos fases, como talleres: **A** (migración, pgTAP, `db:types`) con crítica de código al cerrarla; **B** (dominio y pantallas).

**Base** (`supabase/migrations/<ts>_recursos.sql`)
- `create type tipo_recurso as enum ('PDF','PPTX','DOCX','IMAGEN','VIDEO','ENLACE')` (0015).
- `recurso`: `id int identity`, `taller_id int not null references taller` (**sin `on delete cascade`**: una cascada borraría filas dejando
  archivos huérfanos; además el taller no se borra) + índice, `nombre varchar(200)` con `check (btrim(nombre) <> '')`, `tipo tipo_recurso not null`,
  `ruta_archivo varchar(500) unique`, `url varchar(500)`, `tamanio_bytes bigint`, `orden smallint not null`, `created_at`, `updated_at`.
  CHECKs: archivo xor enlace (`tipo = 'ENLACE'` ⇔ `url` no nulo y `ruta_archivo`/`tamanio_bytes` nulos; si no, al revés), `url ~ '^https://'`,
  `tamanio_bytes > 0` (el tope de 50 MiB vive solo en el bucket), `ruta_archivo like taller_id::text || '/%'`.
- RLS: select `exists (select 1 from public.taller t where t.id = taller_id)` (molde de los puentes); insert/update/delete solo admin.
  `revoke update on recurso from anon, authenticated; grant update (nombre, tipo, ruta_archivo, url, tamanio_bytes, orden) to authenticated`:
  `taller_id` es inmutable.
- `tamanio_bytes` lo manda el cliente (`file.size`, los bytes que subió; el admin es de confianza). **Sin trigger que lea `storage.objects`**:
  corre antes que la RLS (anon recibiría su error en lugar de `42501`), no distingue "no existe" de "no lo veo" y acopla la base a internals
  de storage-api (`critica.md` punto 1).
- Triggers `recurso_auditar` y `recurso_tocar_updated_at`.
- RPC `ordenar_recursos(p_taller_id int, p_ids int[]) returns void`: plpgsql, security invoker, `search_path = ''`. Si `p_ids` no es exactamente
  el conjunto de recursos del taller → `raise` (P0001). Actualiza `orden = posición` solo donde cambia (no infla la auditoría).
  `revoke execute from public, anon; grant to authenticated`.
- **Bucket**: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('talleres', 'talleres', false,
  52428800, array[pdf, pptx, docx, image/jpeg, image/png, image/webp, video/mp4])` en la migración (sirve en local y en la nube;
  `config.toml` solo aplica a local). El bucket es la autoridad de formato y tamaño.
- **Políticas de `storage.objects`** (`to authenticated`, `bucket_id = 'talleres' and (select public.es_admin())`): select, insert y delete.
  Sin update: cada subida usa una ruta nueva, nunca `upsert`. anon sin políticas.
- Rutas de objeto: `<taller_id>/<uuid>.<ext>` (el nombre visible vive en `recurso.nombre`; el uuid evita colisiones y caracteres raros).

**Dominio** (`src/features/recursos/`, dominio propio: cohesión con Storage; `Taller` lo importa)
- `types.ts`: `Recurso = Tables<'recurso'>`, `TipoRecurso = Enums<'tipo_recurso'>`, `ETIQUETA_TIPO_RECURSO satisfies Record<TipoRecurso, string>`.
- `archivos.ts` (puro): **una tabla `FORMATOS`: extensión → `{ tipo, mime }`** (pdf, pptx, docx, jpg, jpeg, png, webp, mp4). De ella salen
  `MIME_POR_TIPO` (espejo de `allowed_mime_types`, que el pgTAP fija), `formatoDeArchivo(file)` (por extensión, sin depender de `file.type`),
  `validarArchivo(file)` → motivo | null, `TAMANIO_MAXIMO`, `rutaNueva(tallerId, ext)`, `nombreSinExtension`, `idDeYoutube(url)`
  (watch, youtu.be, shorts, embed) y `formatearTamanio(bytes)`.
- `consultas.ts` (solo supabase): `subirArchivo(ruta, file, mime)` (sube `new File([file], file.name, { type: mime })`: storage-js ignora
  `contentType` con un `File`), `borrarArchivo(ruta)`, `insertarRecurso`, `actualizarRecurso`, `eliminarFilaRecurso`, `ordenarRecursos` (rpc),
  `urlFirmada(ruta)` (`createSignedUrl(ruta, 60)`).
- `secuencias.ts`: `altaArchivo`, `reemplazarArchivo`, `eliminarRecurso`, funciones async que importan sus pasos de `./consultas` e implementan
  el orden y las compensaciones del criterio 7. `secuencias.test.ts` usa `vi.mock('./consultas')` (molde de 0012, sin puertos inyectados).
- `errores.ts` (puro): `mensajeDeErrorRecurso(error)` (413 → tamaño, 415 → formato, genérico). La forma real del error de Storage se
  verifica contra la base local en la fase B.
- Hooks (`hooks/useRecursos.ts`): `useAltaArchivos` (lote: `orden = max + 1 + i` calculado una vez al empezar; **invalida una sola vez al
  terminar el lote**), `useCrearEnlace`, `useActualizarRecurso`, `useReemplazarArchivo`, `useEliminarRecurso`, `useOrdenarRecursos`; invalidan
  la clave de talleres, que `useTalleres.ts` pasa a exportar (`CLAVE_TALLERES`) en lugar de repetir el literal. **Lectura sin hook nuevo**:
  `obtenerTalleres` embebe `recurso(*)` ordenado por `orden, id` (`referencedTable`), y `Taller` suma `recurso: Recurso[]`. Admin y portal leen
  los recursos de `useTaller` / `useTallerPublicado`.

**Pantallas**
- `RecursosPage` (`/admin/talleres/:nivelId/:categoriaId/:tallerId/recursos`, mismo "no encontrado" que la edición): lista con tipo, nombre,
  tamaño, Subir/Bajar, Ver, Editar, Reemplazar (solo archivos) y Eliminar (`ConfirmDialog`); `FileDropzone` para archivos y diálogo para enlaces.
  Las subidas múltiples van de a una, con estado por archivo (subiendo / error con motivo).
- `FileDropzone` suma una prop opcional `onFiles(files: File[])`, sin cambiar su contrato actual (normativas no se toca).
- `TalleresListPage` y `TallerFormPage`: criterio 10. `TallerDetallePage`: criterio 9 (componente `ListaRecursos`).

**Tests**: `archivos.test.ts`, `secuencias.test.ts` (cada compensación y el `console.warn`), `errores.test.ts`, hooks con `vi.mock('../consultas')`,
`RecursosPage` (alta, rechazo por formato/tamaño, enlace, reordenar, reemplazar, eliminar), `TallerDetallePage` (lista, total, iframe de YouTube
con nocookie, enlace externo, sin sección si no hay recursos), `TalleresListPage` (columna Recursos), `TallerFormPage` (alta navega a recursos).
pgTAP del criterio 11.

**Docs**: `arquitectura.md` (nueva fila del dominio `recursos` y quitar "Recursos pendientes" de la fila de talleres; Storage y rutas;
Brechas: limpieza de huérfanos, subida reanudable, guardia global de Storage al sumar el bucket de normativas), `definicion-dam.md` §8.3
(`tipo` como enum `tipo_recurso`; tope de tamaño en el bucket), skill `supabase-rls` (sección Storage: bucket por migración, políticas en
`storage.objects`, no se borra por SQL, un trigger BEFORE corre antes que la RLS), `notas.md`.

## Fuera de alcance
- Descarga pública: Edge Function `descargar-taller`, formulario, `registro_descarga`, padrón, `DescargaModal` (corte descargas).
- Limpieza automática de huérfanos en Storage; subida reanudable (TUS) y barra de progreso; vista previa de PDF o imágenes.
- Buckets públicos de normativas y logo (sus cortes). Mover recursos entre talleres. Arrastrar para ordenar.
- Exigir al menos un recurso para publicar (ver pregunta 2).

## Decisiones del usuario (2026-10-10)
1. **Enlaces**: cualquier `https://`; YouTube se integra y el resto se muestra como enlace externo. 0009 no lo restringe; si hace falta,
   se restringe con un CHECK.
2. **Publicar sin recursos**: permitido; la lista del panel muestra la cantidad. Bloquearlo obligaría a decidir qué pasa al eliminar el
   último recurso de un taller publicado.
3. **Tras el alta del taller se va a sus recursos** (criterio 10).

## Verificación de punta a punta
1. `npm run db:reset && npm run test:db && npm run db:types && npm run typecheck && npm run lint && npm test && npm run build` → verde.
2. Como admin: crear un taller (va a recursos), subir un PDF y un PPTX, agregar un enlace de YouTube; intentar un `.exe` y un archivo de 60 MB
   (rechazados con motivo). Reordenar, renombrar, reemplazar el PDF (en Studio desaparece el objeto viejo), "Ver" abre el archivo.
3. Publicar y abrir `/talleres/:id` sin sesión: lista con tipos, tamaños y total, video integrado, sin descarga. Pedir el objeto por la URL
   pública del bucket → error.
4. Eliminar un recurso: en Studio no quedan ni la fila ni el objeto; `registro_operacion` tiene las filas del admin.
