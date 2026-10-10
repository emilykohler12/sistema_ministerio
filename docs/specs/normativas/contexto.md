# Contexto: corte normativas (mocks a Supabase)

Relevado por `Explore` (solo lectura) el 2026-10-10, sobre `main` en `e13484c`.

## 1. Estado actual de `normativas` y sus usos

**Dominio** (`src/features/normativas/`):
- `types.ts`: `Normativa` escrito a mano, con `id: string`, `titulo`, `descripcion`, `numero: string`, `anio: string`,
  `etiquetas: string[]`, `archivo: string`, `responsable` y `descargas: number`. No deriva de la base, como pide 0012.
- `hooks/useNormativas.ts`:
  - `useNormativas({busqueda})`, clave `['normativas', filtro]`. Filtra con `toLowerCase().includes` sobre título, número y etiquetas.
    No ignora tildes ni busca en la descripción. Tiene un `setTimeout` de 300 ms simulado.
  - `useNormativa(id: string|undefined)`, clave `['normativas','detalle',id]`.
- `mocks/normativas.mock.ts`: arreglo vacío.
- **No hay ningún test de normativas.**

**Pantallas:**
- `src/pages/public/NormativasPublicPage.tsx`: lista con `titulo · numero`, `anio` y un `Badge` por etiqueta.
  - Usa `TallerBuscador`.
  - El botón "Descargar" (línea 45) no hace nada.
  - Estados: `TableSkeleton`, `ErrorFallback` y `EmptyState`.
- `src/pages/public/HomePage.tsx`: `normativasRecientes = (data ?? []).slice(0, 3)` (línea 26), así que depende del orden del hook. En las
  líneas 108-141, el botón "Descargar" tampoco hace nada.
- `src/pages/admin/normativas/NormativasAdminPage.tsx`: tabla con título, número, etiquetas, año, descargas y acciones.
  - "Editar" navega a `/admin/normativas/nueva?editar=<id>`.
  - El `onConfirm` del `ConfirmDialog` de "Eliminar" solo cierra el diálogo (línea 94).
- `src/pages/admin/normativas/NormativaFormPage.tsx`:
  - Esquema zod: `titulo` min 2, `descripcion` opcional, `etiquetas` sin límites, `numero` min 1 y `anio` como string `^\d{4}$`.
  - `TagInput` sin sugerencias.
  - `FileDropzone` solo guarda nombres; el `File` nunca se guarda.
  - `onSubmit` es un `setTimeout`.
  - El campo "responsable" está deshabilitado (no es columna; lo cubre la auditoría) y el botón dice "Publicar".
- `src/app/router.tsx`: `/normativas` (línea 63) y las rutas admin `normativas` y `normativas/nueva` (líneas 100-101). La edición va por `?editar=`.

## 2. Dashboard
`useDashboardMetrics` sale todo de mocks. `kpisMock.normativasPublicadas: 0` se muestra en `DashboardPage.tsx:42`. No existe el
contador por normativa de §5.4. El dashboard no tiene corte propio todavía.

## 3. Patrón de `recursos` (qué se generaliza y qué está acoplado a `talleres`)
- `archivos.ts` (puro):
  - `TAMANIO_MAXIMO`, `FORMATOS` (acoplado a `TipoRecurso`), `MIME_POR_TIPO` y `rutaNueva(tallerId, ext)` (prefijo `<taller_id>/`).
  - Funciones genéricas: `extensionDe`, `nombreSinExtension` y `formatearTamanio`.
- `consultas.ts`:
  - `BUCKET = 'talleres'`.
  - `subirArchivo` usa `upsert:false` y reenvuelve el archivo con `new File([file], name, {type: mime})`.
  - `borrarArchivo` trata `data: []` como falla.
  - `urlFirmada` sirve solo para buckets privados; el bucket público usaría `getPublicUrl`.
  - Lecturas `.insert/.update().select().single()`: convierten un RLS silencioso en error.
- `secuencias.ts`: implementa el molde de 0016 (`altaArchivo`, `reemplazarArchivo`, `eliminarRecurso`, `compensar`, `borrarOAvisar`), pero llama
  directamente a las consultas de `talleres`.
- `errores.ts`: `mensajeDeErrorRecurso` (413/415 en `status` o `statusCode`) y `esRechazoDelServidor` (`code` string no vacío; genérico).
- `hooks/useRecursos.ts`: mutaciones que invalidan `CLAVE_TALLERES`. Tests de referencia: `useRecursos`, `archivos`, `errores` y `secuencias`.
- En talleres, `filtrar.ts` exporta `normalizar` (NFD sin diacríticos, minúsculas) y `consultas.ts` escribe con `supabase.rpc('guardar_taller', …)`.

## 4. Etiquetas
- Tabla `etiqueta` (`20261010034807_talleres.sql:74-79`):
  - Índice único sobre `lower(inmutable_unaccent(btrim(nombre)))`.
  - Select público, insert solo admin, sin update ni delete.
  - Trigger de auditoría.
- Puente `taller_etiqueta`: PK compuesta, select que hereda la visibilidad del padre e insert/delete solo admin.
- La RPC `guardar_taller` (security invoker) arma el bloque de etiquetas así:
  1. Normaliza en memoria.
  2. Hace `insert … on conflict do nothing`.
  3. Resuelve los ids y valida con `cardinality`.
  4. Sincroniza el puente por diferencia.
- `useEtiquetasSugeridas` (`useTalleres.ts:29-37`) deriva las sugerencias **de los talleres cargados** y no lee la tabla `etiqueta`.
- `TagInput` compara de forma exacta y filtra con `toLowerCase`.

## 5. Migraciones, Storage y tests globales
- Bucket `talleres` (`recursos.sql:138-172`):
  - Se crea por migración con `public=false`, tope de tamaño y MIME.
  - Políticas `select/insert/delete` sobre `storage.objects` `to authenticated` con `es_admin()`. Sin update.
- Guardias globales: `rls_global`, `auditoria_global`, `updated_at_global` y `truncate_global`. **No hay guardia global de Storage.**
  `recursos.test.sql` verifica, solo para su bucket, que no haya políticas para anon/public ni de update. El DELETE de objetos se prueba con
  `set local storage.allow_delete_query = 'true'`.
- Una RPC anónima que haga UPDATE de `normativa.descargas` dispararía `auditar()` y `tocar_updated_at()` en cada descarga.

## 6. Definición
- §8.3 `normativa`:

  | Columna | Tipo | Restricciones |
  |---|---|---|
  | `id` | int | |
  | `titulo` | varchar(200) | NOT NULL |
  | `descripcion` | text | |
  | `numero` | varchar(50) | NOT NULL |
  | `anio` | smallint | NOT NULL |
  | `ruta_archivo` | varchar(500) | NOT NULL; ruta en el bucket público |
  | `descargas` | int | NOT NULL, default 0 |
  | `created_at`, `updated_at` | | según el diagrama |

  `normativa_etiqueta` tiene PK compuesta.
- §8.4: baja física, también en Storage. §5.1: búsqueda por título, número y etiquetas, con descarga directa. §5.2: ABM y etiquetas compartidas.
  §5.4: KPI de normativas publicadas y contador por normativa. §9.3: el navegador abre el archivo público e invoca la RPC.

## 7. UI reutilizable
- `TagInput`, `FileDropzone` (tiene `onFiles?(File[])`; el hint por defecto hay que reemplazarlo) y `ConfirmDialog`.
- `Button`, `Input`, `Textarea`, `Label`, `FieldError`, `Badge`, `Card`, `EmptyState`, `ErrorFallback`, `TableSkeleton` y `Select`.
- No hay componente `Table`. `TallerBuscador` lo usan las dos pantallas de normativas.

## Decisiones aplicables
0004, 0005, 0007, 0012, 0013, 0014, 0015 y 0016.

## Riesgos y preguntas abiertas (relevadas)
1. Las sugerencias de etiquetas salen solo de los talleres, así que no se comparten con normativas como pide §5.2.
2. El bloque de etiquetas de `guardar_taller`: hay que decidir si se reutiliza o se duplica.
3. Contador anónimo:
   - la función tiene que ser security definer;
   - hay que decidir si el incremento se audita o no;
   - el contador se puede manipular.
4. Ruta en el bucket: con "subir antes de insertar" (0016) el id todavía no existe al subir.
5. Cambio de tipos (`id`, `anio`, etiquetas) y la validación del id que llega en `?editar=`.
6. La búsqueda tiene que ignorar tildes e incluir la descripción (reutilizar `normalizar`).
7. Hay que fijar el orden de la consulta, porque la Home muestra los tres primeros.
8. Reemplazo de archivo al editar.
9. El KPI del dashboard sigue en mock.
10. `esRechazoDelServidor` y las funciones de Storage viven en `recursos`.
11. `taller_normativa` (C-02) queda fuera de alcance.
