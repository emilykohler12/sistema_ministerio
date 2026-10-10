# Notas: normativas (fase A, base de datos)

Implementación de la fase A de `spec.md` con dos migraciones, en este orden (cada una puede ir en su propio commit):
- `supabase/migrations/20261010155216_resolver_etiquetas.sql`: refactor. `resolver_etiquetas(text[]) returns int[]` extraída de `guardar_taller`.
- `supabase/migrations/20261010155300_normativas.sql`: tablas `normativa` y `normativa_etiqueta`, RLS, triggers, `guardar_normativa`,
  `contar_descarga_normativa` y bucket público `normativas`.

## Desvíos respecto de la definición v2
§8.3 quedó actualizado con todo esto.
- **CHECK de `titulo` y `numero` no vacíos, `anio` entre 1900 y 2100 y `ruta_archivo ~ '^[0-9a-f-]{36}\.pdf$'`** (crítica 7). La definición no
  tenía CHECK.
- **Índice único sobre (`lower(inmutable_unaccent(btrim(numero))), anio`)** (criterio 1): el mismo número y año no se repite.
- **`ruta_archivo` es `unique`**, como en `recurso`.
- **Bucket `normativas` con `file_size_limit` de 20 MiB y solo `application/pdf`.** La definición solo decía "bucket público".
- **`descargas` fuera del grant de UPDATE** (crítica 2): desde la API la única forma de cambiarla es `contar_descarga_normativa`. Un rol con
  bypass (`postgres`, `service_role`) sí podría; ver la ronda de correcciones.
- **Sin política de UPDATE en `normativa_etiqueta`.** La spec la lista junto a insert y delete ("insert, update y delete solo del
  admin"), pero también dice "igual que `taller_etiqueta`", que no la tiene porque la PK es toda la fila. Se siguió el molde: el puente se
  sincroniza por diferencia (borra e inserta), nada lo actualiza. Un UPDATE del admin afectaría 0 filas. Si se prefiere la política literal,
  es una línea en una migración nueva.

## Decisiones menores de la migración
- **`resolver_etiquetas` cambia el mensaje de su error interno** a `No se pudieron resolver todas las etiquetas` (antes mencionaba el id
  del taller, que la función ya no conoce). Ningún test lo mira.
- **`guardar_taller` por `create or replace`** con la misma firma: los grants se conservan (los verifica `talleres.test.sql`).
- **`guardar_normativa` devuelve una sola fila `(id, ruta_anterior)`.** `ruta_anterior` sale de un `select ... for update` previo al
  update; solo se devuelve si el guardado reemplazó el archivo (ver la ronda de correcciones). Las consultas califican con alias (`n.id`) porque las columnas de
  `RETURNS TABLE` son variables de plpgsql.
- **Alta sin ruta (23502) y ruta con formato inválido (23514)** salen de las restricciones de la tabla, sin chequeo propio en la RPC.
  Un `p_numero` nulo también da 23502 (`btrim(null)` es nulo).
- **Un usuario sin la marca que edita recibe `P0002`**, no `42501`: el `for update` no ve la fila por la RLS. Es el mismo comportamiento
  que `guardar_taller` en la edición. En el alta sí recibe `42501`.
- **`contar_descarga_normativa` es `language sql`**, security definer, `search_path = ''`. `revoke ... from public` y `grant ... to anon, authenticated`.
- **Dos triggers de auditoría en `normativa`** (`normativa_auditar_alta_baja` sin `WHEN` y `normativa_auditar_edicion` con el `WHEN`
  de la ronda de correcciones) y `normativa_tocar_updated_at` con el mismo `WHEN`. `normativa_etiqueta` lleva el trigger
  combinado de siempre.
- **Políticas de `storage.objects`**: `normativas_objetos_{select,insert,delete}_admin`, `to authenticated`, con `bucket_id = 'normativas'` y
  `es_admin()`. Bucket con `insert` plano (sin `on conflict`), como `talleres`.
- **Sin índice por `anio`**: el orden del listado (año desc, id desc) es sobre pocas filas; se agrega si hace falta.

## Ronda de correcciones (fase A)
Tras la crítica de código y la revisión (`critica.md`, `revision.md`); la migración no está en `main`, así que se corrigió en el lugar.
- **`ruta_anterior` solo si se reemplazó el archivo.** `guardar_normativa` la devuelve únicamente cuando `p_ruta_archivo` es no nulo y distinto
  de la ruta vigente. Si se conserva el archivo (ruta nula o la misma) y en un alta, es `null`: un cliente que borre "la anterior" nunca
  borra el PDF que la fila sigue apuntando (0016). La fase B la tipa como `string | null` (typegen la da como `string`).
- **`WHEN` ampliado en los dos triggers de update** (`normativa_auditar_edicion` y `normativa_tocar_updated_at`):
  `old.descargas = new.descargas or (to_jsonb(old) - 'descargas' - 'updated_at') is distinct from (to_jsonb(new) - 'descargas' - 'updated_at')`.
  Solo se omiten cuando lo único que cambia es el contador. Un UPDATE de un rol con bypass que cambia `descargas` y otra columna sí se
  audita y mueve `updated_at` (definición §9). Comentarios de la migración ajustados ("la única forma" pasó a "desde la API").
- **Test del UPDATE del puente** (anon y sin marca): en lugar de `set etiqueta_id = etiqueta_id`, intenta cambiar `etiqueta_id` a otra
  etiqueta existente y verifica que ninguna fila cambió.
- **`resolver_etiquetas.test.sql`**: se quitó el assert de `aclexplode` de PUBLIC (redundante: si PUBLIC tuviera EXECUTE, `anon` lo
  tendría y el assert de `anon` fallaría). Plan 12 a 11.
- **Test de atomicidad sin cambios.** No se puede fortalecer barato: todos los fallos posibles de la RPC ocurren antes de resolver las
  etiquetas (el insert o el update de la fila van primero), así que ninguno podría dejar una etiqueta creada.
- **Mutación comprobada:** con el `WHEN` viejo (`old.descargas = new.descargas`) falla el nuevo assert del UPDATE con bypass.

## Ajustes a tests
- `supabase/tests/normativas.test.sql`: un único ajuste, en el `results_eq` de las columnas (línea 82). El test fallaba con
  `could not determine which collation to use for string comparison` antes de correr el primer assert propio: `column_name`,
  `data_type` e `is_nullable` de `information_schema` traen la collation del dominio `sql_identifier` / `character_data` y chocan con la
  de los literales del `values`. Se agregó `collate "default"` a esas tres columnas. No cambia lo que se verifica. Con eso, los 106
  asserts pasan.
- Ronda de correcciones, en `normativas.test.sql` (106 a 111): `e1_ant` ahora espera `<null>`; se agregó la edición con la misma ruta
  (`ruta_anterior` null) y el conteo de UPDATE de `N Base` pasó de 3 a 4; dos asserts del UPDATE con bypass sobre `N 1900` (hecho al
  principio, porque tras `reset role` el claim sigue puesto); dos asserts del UPDATE del puente.
- `resolver_etiquetas.test.sql` (11 tras la ronda) y `storage_global.test.sql` (5) pasan sin cambios propios. `storage_global` ya pasaba antes de las migraciones
  (la guardia nueva se aplica al estado actual, que ya era correcto); su valor es que falla si un bucket futuro rompe la regla.

## Verificación
- `npm run db:reset && npm run test:db`: 15 archivos, 398 asserts tras la ronda de correcciones, todos en verde (`normativas` 111, `resolver_etiquetas` 11,
  `storage_global` 5, `talleres` como regresión de `guardar_taller`, y las guardias globales).
- Confirmado en rojo antes de implementar: `normativas` y `resolver_etiquetas` fallaban por objeto inexistente.
- `npm run db:types` regeneró `src/shared/types/database.ts` (solo agregados: tablas `normativa` y `normativa_etiqueta`, y las funciones
  `contar_descarga_normativa`, `guardar_normativa` y `resolver_etiquetas`).
- `npm run typecheck` pasa sin tocar el frontend. `npm run lint` sin errores (solo los warnings previos).

# Notas: normativas (fase B, dominio y pantallas)

Implementación de la fase B de `spec.md` (criterios 1-6 y 9), en el orden sugerido: `shared/lib/storage.ts`, etiquetas y talleres,
dominio normativas y pantallas. Sin commits.

## Archivos
- Nuevos: `src/shared/lib/storage.ts`, `src/shared/components/ui/botonClases.ts`, `src/features/etiquetas/{types,consultas}.ts`,
  `src/features/etiquetas/hooks/useEtiquetas.ts`, `src/features/normativas/{archivos,consultas,errores,filtrar,secuencias}.ts`,
  `src/features/normativas/components/EnlaceDescarga.tsx`.
- Reescritos: `src/features/normativas/types.ts`, `src/features/normativas/hooks/useNormativas.ts`, `NormativasPublicPage`, `HomePage`,
  `NormativasAdminPage` y `NormativaFormPage`.
- Modificados: `recursos/{consultas,secuencias,errores}.ts` (usan `shared/lib/storage`), `talleres/{types.ts,hooks/useTalleres.ts}`,
  `TallerFormPage.tsx`, `Button.tsx`.
- Borrados: `src/features/normativas/mocks/`, `useEtiquetasSugeridas` (reemplazado por `useEtiquetas`).

## Decisiones y desvíos
- **`recursos/consultas` conserva `subirArchivo(ruta, file, mime)` y `borrarArchivo(ruta)`** como wrappers finos con el bucket `talleres`;
  `normativas/consultas` hace lo mismo con `subirArchivo(ruta, file)` (MIME fijo `application/pdf`). Las secuencias de cada dominio
  inyectan su `borrarArchivo` en `compensar` y `borrarOAvisar` de `shared/lib/storage` (firma fijada por `storage.test.ts`), así que sus
  tests siguen mockeando `./consultas`. `esRechazoDelServidor` es privado en `storage.ts` y dejó de exportarse desde `recursos/errores.ts`.
- **`Etiqueta` vive en `features/etiquetas/types.ts`**; `talleres/types.ts` la importa (antes la definía). No cambia el tipo.
- **`ruta_anterior` y `p_descripcion`/`p_ruta_archivo`** (revisión fase A, punto 4): `normativas/types.ts` define `ArgsGuardarNormativa`
  (`p_descripcion: string | null`, `p_ruta_archivo?: string | null`) y `ResultadoGuardarNormativa` (`ruta_anterior: string | null`). El cast
  al tipo generado está en un único lugar (`guardarNormativa` en `consultas.ts`), que además toma la primera fila del `RETURNS TABLE`.
- **`editarNormativa` borra solo `ruta_anterior`** si no es `null`; sin archivo manda `p_ruta_archivo: null` y no sube ni borra nada.
- **URL pública**: `obtenerNormativas` agrega `url` a cada fila con `getPublicUrl(ruta)` sin `download`; el orden y el filtro se aplican en
  el hook (`ordenarNormativas` + `filtrarNormativas`), una sola clave `['normativas']`.
- **`useContarDescarga`** (reemplazado por `contarDescarga`, ver la ronda de correcciones): marca `normativa-descarga-contada:<id>` en `sessionStorage`, llama sin `await` y absorbe errores síncronos y
  rechazos; si `sessionStorage` no está disponible cuenta igual.
- **`EnlaceDescarga`** (`<a target="_blank" rel="noopener noreferrer">`, `aria-label="Descargar <título>"`) lo comparten la página
  pública y la Home. `Button` no admite enlaces, así que sus clases se extrajeron a `ui/botonClases.ts` (en `Button.tsx` un export extra
  disparaba el warning `only-export-components`); `Button` se comporta igual.
- **`NormativaFormPage`**: el PDF va dentro del esquema zod (`archivo: File | null`, validado con `validarPdf`, obligatorio solo en el
  alta) para que su error salga como los demás (`role="alert"`, id `archivo-error`). El año queda como texto en el formulario (4 dígitos
  y 1900-2100) y se convierte a número al enviar; título y número se recortan; descripción vacía va como `null`. Un id inválido o
  inexistente en `?editar=` reutiliza `NoEncontrado` de `pages/admin/talleres` ("Normativa no encontrada"). Sin `useAuth` ni campo
  "responsable"; el botón es "Guardar"; se muestra el enlace "Ver archivo actual" a `normativa.url`.
- **`NormativasAdminPage`**: la baja usa `useEliminarNormativa`; si falla, se muestra un `role="alert"` con `mensajeDeErrorNormativa`.
- **Mensajes**: `MOTIVO_FORMATO` = "Formato no admitido. Subí un archivo PDF."; `MOTIVO_TAMANIO` = "El archivo supera el tamaño máximo de
  20 MB."; 23505 = "Ya existe una normativa con ese número y año.".

## Ajustes a tests
- `src/features/normativas/hooks/useNormativas.test.ts`: un único ajuste, de tipos. El test usa `process.on/off('unhandledRejection')`,
  pero `tsconfig.app.json` solo carga `vite/client` y `tsc -b` fallaba con `TS2591: Cannot find name 'process'`. Se declaró una constante
  local `proceso` (`globalThis.process` con los dos métodos usados). No cambia lo que se verifica.
- Sin otros cambios en los tests de test-writer (los ajustados `useTalleres.test.ts`, `TallerFormPage.test.tsx` y `recursos/errores.test.ts`
  pasan tal como están).

## Verificación
- `npm test`: 38 archivos, 499 tests en verde. `npm run typecheck` sin errores. `npm run lint`: 0 errores y 4 warnings previos
  (`AuthContext`, `ConfiguracionPage`, `TallerFormPage`, `DescargaModal`). `npm run build` en verde.
- No se tocó `supabase/`. Pendiente: actualizar `docs/arquitectura.md` (a cargo del coordinador).

## Ronda de correcciones (fase B)
Tras la crítica de código y la revisión de la fase B (`critica.md`, `revision.md`).
- **Piezas genéricas a `shared`** (mecánico, sin cambiar comportamiento; `normativas` deja de depender de `talleres`):
  - `NoEncontrado` pasó a `shared/components/ui/NoEncontrado.tsx` con `volverA` obligatorio (los usos de talleres pasan
    `/admin/talleres` donde antes era el valor por defecto).
  - `TallerBuscador` pasó a `shared/components/ui/Buscador.tsx` con `etiqueta` y `placeholder` como props y el id con `useId`.
    Talleres conserva su texto ("Buscar por nombre o etiqueta"); normativas usa "Buscar por título, número o etiqueta".
  - `normalizar` pasó a `shared/lib/texto.ts` e `idDeRuta` a `shared/lib/rutas.ts` (ahora también acepta `null`, por
    `searchParams.get`). Los imports de talleres se actualizaron.
  - `codigos()` pasó a `shared/lib/erroresStorage.ts` como `codigosDeError` (puro); `recursos/errores.ts` y `normativas/errores.ts`
    conservan sus mensajes.
- **Baja con la ruta de la base**: `eliminarFilaNormativa(id)` hace `.delete().eq('id', id).select('ruta_archivo').single()` y devuelve la
  ruta; `eliminarNormativa(id)` y `useEliminarNormativa` reciben solo el id y borran esa ruta. Brecha anotada, fuera de este corte:
  `recursos/secuencias.ts` (`eliminarRecurso`, `reemplazarArchivo`) todavía borra la ruta del recurso recibido (de la caché).
- **`contarDescarga(id)`**: función común (ya no un hook) con `sessionStorage` y `void contarDescargaNormativa(id).catch(() => {})`.
  Se borró el test del caso síncrono.
- **`isLoading` a `isPending`** en `NormativasPublicPage`, `HomePage` (sección normativas) y `NormativasAdminPage`, porque sin red la
  primera carga queda pausada. `NormativaFormPage` ya usaba `data === undefined` tras descartar `isError`, así que no cambió.
- **`EnlaceDescarga`** también cuenta en `onAuxClick` con `button === 1` (botón del medio).
- **`NormativaFormPage`**: `Label` asociado al input de archivo (`FileDropzone` acepta `id`, `invalid` y `describedBy`), con
  `aria-invalid` y `aria-describedby` apuntando a `archivo-error`.

### Ajustes a tests de esta ronda
- Movidos: `normalizar` (de `talleres/filtrar.test.ts`) a `shared/lib/texto.test.ts` e `idDeRuta` (de `talleres/types.test.ts`) a
  `shared/lib/rutas.test.ts`; nuevo `shared/lib/erroresStorage.test.ts`.
- `secuencias.test.ts`, `useNormativas.test.ts` y `NormativasAdminPage.test.tsx`: la baja recibe el id y la fila devuelve la ruta (con
  un caso nuevo: se borra la ruta devuelta, no otra).
- `useNormativas.test.ts`: los tests del contador llaman a `contarDescarga` sin `renderHook`.
- Tests nuevos: `auxclick` en `NormativasPublicPage`, carga pausada sin red (verificado en rojo con `isLoading`), error de carga en
  `?editar=5` y accesibilidad del campo Archivo en `NormativaFormPage`.

## Pendiente
- Verificación de punta a punta en el navegador (spec, pasos 2 y 3): paso manual del usuario antes del PR. Anotar el resultado aquí,
  incluidos `normativa.descargas` y el conteo de `registro_operacion` antes y después de pulsar "Descargar" dos veces.
- Actualizar `docs/arquitectura.md` (a cargo del coordinador).
