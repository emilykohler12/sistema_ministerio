# Notas: recursos (fase A, base de datos)

Desvíos y decisiones de implementación de la migración `supabase/migrations/20261010044500_recursos.sql`.

## Desvíos respecto de la definición v2
- **`recurso.tipo` es el enum `tipo_recurso`**, no `varchar(20)` (§8.3, ADR 0015). §8.3 quedó actualizado, junto con los CHECK reales
  (`tamanio_bytes > 0`, URL `https://`, prefijo `<taller_id>/`) y la aclaración de que el tope de 50 MiB vive solo en el bucket.
- **Sin trigger que lea `storage.objects`** (crítica punto 1, aceptada): `tamanio_bytes` lo manda el cliente y la base no verifica que el
  archivo exista. El invariante "ninguna fila apunta a un archivo inexistente" lo sostiene el orden de las operaciones de la app (criterio 7).
- **`ruta_archivo` es `unique`** (la definición no lo decía): impide que dos filas compartan archivo, algo que el reemplazo y la
  eliminación darían por supuesto.

## Decisiones menores de la migración
- **Orden desde 1.** `ordenar_recursos` asigna `orden = posición` contando desde 1 (`with ordinality`).
- **Validación de la lista por conjuntos.** Compara los ids pedidos, ordenados, con los ids del taller (`is distinct from`): un faltante,
  uno de más, uno de otro taller, uno repetido o un `null` dan `P0001`. Una lista `null` solo pasa si el taller no tiene recursos.
- **Sin lock en la RPC.** No hay `FOR UPDATE`: con la RLS, un usuario sin la marca vería filtradas las filas y el test exige que no dé
  error. Dos reordenamientos simultáneos del mismo taller pueden mezclarse (ver la ronda de correcciones); se tolera.
- **Un usuario sin la marca recibe `void`**, no `42501`: si el taller es visible (publicado) la lista coincide y el `update` no encuentra
  filas que su política le deje tocar; sobre un taller no visible daría `P0001`.
- **Constraints con nombre** (`recurso_archivo_xor_enlace`, `recurso_url_https`, `recurso_tamanio_positivo`, `recurso_ruta_del_taller`),
  para que el frontend o los logs puedan distinguirlos si hace falta.
- **Bucket con `insert` plano** (sin `on conflict`): si ya existe en algún entorno, la migración falla a la vista en vez de dejar sin
  corregir un bucket con otra configuración.
- **Políticas de `storage.objects`**: `talleres_objetos_{select,insert,delete}_admin`, `to authenticated`, con `bucket_id = 'talleres'`
  y `es_admin()`. Se crean desde la migración (corre como `postgres`) sin problema de permisos en local.

## Ajustes a tests
- `supabase/tests/recursos.test.sql`: 71 asserts en verde a la primera con la migración; luego ajustado en la ronda de correcciones (72).
- Los demás archivos de `supabase/tests/` no cambiaron; las guardias globales (RLS, auditoría, TRUNCATE, `updated_at`) pasan con la
  tabla nueva.

## Verificación
`npm run db:reset && npm run test:db`: 12 archivos, 270 tests, todos ok (271 tras la ronda de correcciones). `npm run db:types` regeneró `src/shared/types/database.ts` con
`recurso`, `ordenar_recursos` y el enum `tipo_recurso`; `npm run typecheck` sin errores.

## Ronda de correcciones (crítica de código, fase A)
1. **DELETE de `storage.objects` probado de forma funcional** (`recursos.test.sql`). Se quitó el assert de existencia sobre `pg_policies`
   (seguía en verde aunque la política perdiera `es_admin()`) y se agregaron dos asserts: sin marca el DELETE deja el objeto (sigue 1) y
   el admin lo borra (quedan 0). Con `set local storage.allow_delete_query = 'true'`, que es lo que fija storage-api en cada request y
   lo que el trigger `protect_delete` respeta. Plan: 71 → 72 (−1 +2). La sección va al final de la parte de Storage, porque el borrado
   del admin saca el único objeto que usan los asserts de lectura.
   - **Trampa hallada al probar que el test detecta la falta de `es_admin()`:** un DELETE con WHERE también exige que la política de
     select deje ver la fila. Sin la marca, la política de select ya oculta el objeto, así que el DELETE borraba 0 filas aunque la de
     delete estuviera abierta, y el assert seguía en verde con la política mutada. Para aislar la política de delete, el test crea una
     política de select temporal (`zz_select_temporal`, solo para `authenticated` sobre el bucket) justo antes del DELETE sin marca y la
     borra después. Con eso, quitar `es_admin()` de la política de delete hace fallar el assert "sin marca: DELETE ... no borra nada"
     (probado con una copia del test que altera la política dentro de la transacción; la migración no se tocó). En producción la
     política de select y la de delete se refuerzan entre sí.
2. **`notas.md`: reordenamientos simultáneos.** Antes decía "gana el último"; no es exacto. En READ COMMITTED, el
   `where orden is distinct from pos` puede descartar filas sin esperar el lock de la otra transacción, así que dos reordenamientos
   simultáneos del mismo taller pueden dejar un resultado mezclado (con algún `orden` repetido). Se tolera: el desempate por `id` lo
   muestra bien y la siguiente llamada renumera. Si algún día hiciera falta serializar, alcanza con `perform pg_advisory_xact_lock(p_taller_id)`
   al inicio de la RPC. `FOR UPDATE` no sirve: bajo RLS un usuario sin la marca vería filas filtradas y la RPC dejaría de devolver `void`.
   No se agrega ningún lock ahora.

# Notas: recursos (fase B, dominio y pantallas)

Desvíos y decisiones de implementación. Los tests de la fase B (Vitest) no se modificaron, salvo una adición en `errores.test.ts` (ver Ajustes).

## Verificaciones contra la base local
Script en el scratchpad (supabase-js, `admin@dam.local` del seed, taller y categoría de prueba creados y borrados con la service role local; al
terminar no quedó ningún objeto en el bucket):
- **Forma real del error de Storage (storage-js 2.117, storage-api 1.79):** `StorageApiError` con `status: 400` (el HTTP de la respuesta, igual para
  ambos casos), `statusCode: '413'` o `'415'` (el código real), `code: 'EntityTooLarge'` / `'InvalidMimeType'` y `message`. **Difería de lo que
  asumía el test** (`status: 413`): con el `errores.ts` pensado para "el primero que exista" un 413 real caía en el mensaje genérico. Corregido:
  `mensajeDeErrorRecurso` mira `status` y `statusCode` y reconoce 413/415 en cualquiera de los dos.
- **`remove()` de una ruta inexistente** devuelve `{ error: null, data: [] }`; `remove()` de un objeto existente, `data.length === 1`; `remove()`
  como `anon` de un objeto existente también `data: []` (la RLS lo oculta). `borrarArchivo` trata `data.length === 0` como falla.
- **Subida con el MIME canónico:** un `.docx` con `type: ''` subido como `new File([file], name, { type: MIME_DOCX })` entra al bucket; un `application/zip`
  da 415 y 52 428 801 bytes dan 413.
- **Embed:** `select('*, categoria(nivel_id), destinatario(*), etiqueta(*), recurso(*)')` con `.order('orden', { referencedTable: 'recurso' })` y
  `.order('id', { referencedTable: 'recurso' })` responde 200, con los recursos ordenados por `orden` y desempatados por `id`, y `tsc` lo tipa contra
  `Taller` sin cast.
- **RPC y RLS desde el cliente:** `ordenar_recursos` renumera; con una lista incompleta da `P0001`; `update` de `taller_id` da `42501`; el
  `delete ... .select('id').single()` de `anon` da `PGRST116` (0 filas) y el del admin devuelve la fila; la URL firmada del admin responde 200 y
  `anon` no puede firmar (`NoSuchKey`).

## Desvíos y decisiones
- **`mensajeDeErrorRecurso` mira `status` y `statusCode`** (ver arriba). El contrato del test lo permitía; solo cambió el criterio de elección.
- **`FileDropzone`**: `files` y `onChange` pasan a ser opcionales (por defecto `[]` y sin efecto) y se suma `onFiles(files: File[])`. Con `files`/
  `onChange` se comporta igual que antes (`NormativaFormPage` no cambia). Con `onFiles` en modo no múltiple entrega solo el primer archivo.
- **Un solo `role="alert"` para las subidas** (`RecursosPage`): junta los archivos rechazados antes de subir (formato o tamaño, con el nombre del
  archivo) y los que fallaron en Storage; un segundo `role="alert"` para los errores de ordenar, eliminar, reemplazar y "Ver". Los tests esperan un solo
  alert por situación.
- **Nombre del recurso al subir:** nombre del archivo sin extensión, recortado y limitado a 200 caracteres (`varchar(200)`); si queda vacío, "Archivo".
- **Reemplazo:** `reemplazarArchivo` rechaza un enlace (no tiene archivo que reemplazar) y el botón "Reemplazar" solo aparece en archivos. El selector
  es un `input[type=file]` oculto por fila que abre el botón.
- **Compensaciones fallidas**: si el borrado del archivo subido (tras un insert o update que falló) también falla, se registra con `console.warn` y se
  propaga el error original, igual que el borrado del archivo anterior.
- **`useAltaArchivos`** espera la invalidación de la caché antes de resolver `subir`; `enCurso` pasa a `false` antes. `RecursosPage` ignora archivos
  nuevos mientras hay un lote en curso.
- **Etiquetas de tipo**: PDF, PowerPoint, Word, Imagen, Video, Enlace. Elegidas para no coincidir con nombres de recursos en los tests (`getByText` exacto).
- **`DialogoRecurso`** (alta de enlace y edición) en `src/features/recursos/components/`, con react-hook-form + zod. Para un archivo solo se renombra: el
  cambio guardado es `{ nombre }`; para un enlace, `{ nombre, url }`.
- **"Ver"** abre `window.open(urlFirmada, '_blank', 'noopener,noreferrer')` después de esperar la firma. Algunos navegadores bloquean pop-ups abiertos
  tras un `await`; si pasa en la práctica, abrir la pestaña antes y asignarle la URL.
- **Ruta del panel** `talleres/:nivelId/:categoriaId/:tallerId/recursos`, con título "Recursos del taller".

## Ajustes a tests
- `src/features/recursos/errores.test.ts`: se agregó un caso con la forma real del error (`status: 400`, `statusCode: '413'`/`'415'`/`'404'`). Los casos
  existentes no cambiaron.
- Los demás tests de la fase B no se modificaron.

## Ronda de correcciones (crítica de código fase B y revisión)
Cada cambio de comportamiento tiene un test que se vio fallar antes (12 tests en rojo, luego en verde).
1. **Compensar solo si el servidor rechazó la escritura** (crítica 1, invariante del criterio 7). `errores.ts` suma `esRechazoDelServidor(error)`
   (true si `code` es un string no vacío; un corte de red de postgrest-js llega con `code: ''` y `status: 0`). `altaArchivo` y `reemplazarArchivo`
   pasan por `compensar()`: con un rechazo borran el archivo recién subido como antes; con una falla ambigua NO lo borran (la escritura pudo
   haberse confirmado y una fila quedaría apuntando a la nada), registran el posible huérfano con `console.warn` y propagan el error. El peor
   caso pasa a ser un huérfano, el modo de falla aceptado. Tests en `errores.test.ts` y `secuencias.test.ts` (alta y reemplazo con `code: ''`, con un
   `Error` sin `code` y con un rechazo que sigue compensando).
   - **Opcional no hecho:** que `eliminarFilaRecurso` devuelva la `ruta_archivo` real de la fila para borrar esa y no la de la caché. Cambia el
     contrato de `consultas` que fijan los tests del test-writer (los mocks devuelven `undefined`) y no rompe el invariante (las rutas son uuid y
     no se reusan); queda como mejora posible.
2. **`ocupado` incluye `alta.enCurso`** (crítica 2): durante un lote Subir/Bajar, Reemplazar, Eliminar y "Agregar enlace" quedan deshabilitados.
   Antes, con la caché vieja hasta el final del lote, reordenar daba `P0001` y un enlace repetía un `orden`. Test: "mientras sube…".
3. **`useVerArchivo`** (crítica 3, revisión 6; regla de `react.md`): mutación en `hooks/useRecursos.ts` que firma la ruta y hace el `window.open`.
   La página ya no importa `consultas`. Si "Ver" cae en el bloqueador de pop-ups, el plan B (abrir la pestaña antes y asignarle la URL) se
   implementa ahí. Tests de hook (abre y falla) y los de la pantalla existentes.
4. **Archivos elegidos durante un lote** (revisión 3): ya no se descartan en silencio; la pantalla avisa "Esperá a que termine la subida en
   curso…" y no sube nada. Se eligió avisar y no encolar, por simplicidad. Test.
5. **Un lote nuevo limpia los errores del anterior** (revisión 4), también si todos los archivos nuevos se rechazan: `useAltaArchivos.subir`
   reinicia `estados` antes de comprobar la lista vacía. Tests de hook y de pantalla.
6. **Ramas de error** (revisión 2): tests en `RecursosPage.test.tsx` para el alta de enlace y la edición con falla (el diálogo queda abierto con el
   mensaje) y el reemplazo rechazado por el bucket con 413 (alert de tamaño, sin tocar la fila). Ya pasaban: la implementación existía sin test.
7. **`Alerta`** (revisión 5): `key` por índice y no por el texto, que puede repetirse (mismo archivo y mismo motivo).
8. **`docs/arquitectura.md`** (revisión 7): la fila `descargas` dice "hasta el corte descargas" y la definición de `Taller` suma los recursos.
- **Fuera de la ronda:** `useTallerDeRuta` (resolución de ruta del taller compartida con `TallerFormPage`) queda sin hacer, como se pidió; si el
  corte descargas necesita la misma resolución, conviene extraerla entonces.
- **Ajustes a tests:** solo se agregaron casos (`errores.test.ts`, `secuencias.test.ts`, `useRecursos.test.ts`, `RecursosPage.test.tsx`); ninguno
  de los existentes cambió.

## Pendiente de verificación manual
Pasos 2 a 4 de "Verificación de punta a punta" de la spec, que hace el usuario con `npm run dev` y Supabase local (lo que solo se ve en la app):
2. Como admin: crear un taller (debe ir a su pantalla de recursos), subir un PDF y un PPTX, agregar un enlace de YouTube; intentar un `.exe` y un
   archivo de 60 MB (rechazados con motivo). Reordenar, renombrar y reemplazar el PDF (en Studio desaparece el objeto viejo). "Ver" abre el archivo
   (comprobar que el bloqueador de pop-ups no lo frena).
3. Publicar y abrir `/talleres/:id` sin sesión: lista con tipos, tamaños y total, video integrado, sin descarga. Pedir el objeto por la URL pública
   del bucket debe dar error.
4. Eliminar un recurso: en Studio no quedan ni la fila ni el objeto; `registro_operacion` tiene las filas del admin.
Resultado: pendiente (anotar acá la fecha y quién lo confirmó).
