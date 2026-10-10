# Contexto: recursos + Storage

Relevamiento de solo lectura (Explore + verificación del agente principal contra la base local, 2026-10-10).
Rutas relativas a la raíz del repo. Sin propuesta de diseño (está en `spec.md`).

## 1. Frontend hoy
- **Sin residuos de recursos.** El corte talleres quitó `Recurso`, `RecursoArchivo` y `TipoRecurso` de `src/features/talleres/types.ts`.
  No hay mocks de recursos ni formateador de bytes (`formatBytes` no existe). `src/shared/lib/` tiene `date.ts`, `supabase.ts` y `utils.ts`.
- **`FileDropzone`** (`src/shared/components/ui/FileDropzone.tsx`): solo UI, trabaja con nombres (`files: string[]`, `onChange(string[])`).
  No guarda `File`, no valida ni sube. Lo usa `NormativaFormPage` (normativas sigue en mock), así que cambiar su contrato la toca.
- Otros UI útiles: `ConfirmDialog` (`onConfirm` síncrono, luego `onClose`), `Dialog`, `Button` (`outline`, `danger`), `Badge`, `EmptyState`,
  `ErrorFallback`, `FieldError`, `Input`, `Label`, `Select`, `Skeleton`. **No hay** lista ordenable, reproductor ni barra de progreso.
- **`TallerFormPage`**: el taller recién tiene `id` al guardar (RPC `guardar_taller` lo devuelve). Tras guardar navega a la lista.
  El test verifica que no haya campos de archivos (`TallerFormPage.test.tsx:106`).
- **`TallerDetallePage`**: nivel, nombre, destinatarios, descripción, etiquetas, "Compartir" sin acción y similares. Sin recursos ni descarga
  (`TallerDetallePage.test.tsx:72` lo verifica).
- **`DescargaModal`** (`src/features/descargas/`): contrato v1 (`recursoNombre`, `recursoTipo`, escuela/localidad/rol hardcodeados,
  `setTimeout` simulado). Ninguna pantalla lo usa. Desalineado con 0006 y 0010; es del corte descargas.
- `TalleresListPage.test.tsx:123` verifica que no haya columna `recursos`.

## 2. Base de datos
- Migraciones: `base` (`es_admin`, `auditar`, `registro_operacion`, `inmutable_unaccent`), `guardias` (TRUNCATE por defecto), `configuracion`
  (`tocar_updated_at`), `niveles_categorias`, `talleres` (enum `estado_taller`, `taller`, puentes, `guardar_taller`, `DA001`/`DA002`).
- **Molde de tabla hija**: los puentes heredan la visibilidad con `using (exists (select 1 from public.taller t where t.id = taller_id))`.
  Funciones de trigger con `revoke execute ... from public, anon, authenticated, service_role`. RPC `security invoker`, `search_path = ''`,
  `revoke execute from public, anon`, `grant to authenticated`. Grants de UPDATE por columna para columnas inmutables (`categoria.nivel_id`).
- **`config.toml`**: `[storage] file_size_limit = "50MiB"` global; ningún bucket definido (solo el ejemplo comentado). Además, `config.toml`
  solo aplica a la base local (skill supabase-rls).
- Sin `supabase/seed.sql`, sin `supabase/functions/`, sin configuración de Deno.
- **Guardias globales** (`rls_global`, `auditoria_global`, `truncate_global`, `updated_at_global`): solo miran `public`. Nada cubre
  `storage.objects` ni buckets; `grep storage supabase/tests` no da resultados.

### Verificado en la base local (Storage)
- `storage.objects` tiene `bucket_id`, `name`, `metadata jsonb` (con `size` y `mimetype` que completa la API de Storage), `owner_id`.
- `storage.buckets` tiene `public`, `file_size_limit bigint`, `allowed_mime_types text[]`.
- Trigger `protect_objects_delete` (y `protect_buckets_delete`): **un `DELETE` SQL sobre `storage.objects` falla con `42501`** ("Use the
  Storage API instead"), salvo `storage.allow_delete_query = 'true'`. Borrar la fila tampoco borraría el archivo del backend.
  Conclusión: ningún trigger de la base puede borrar archivos; el borrado en Storage lo hace el cliente (o una Edge Function).
- `protect_bucket_control_insert` solo protege columnas de lifecycle: **un `insert into storage.buckets` desde una migración funciona**
  (probado en transacción con rollback), y también insertar en `storage.objects` con `metadata` y leer `(metadata->>'size')::bigint`
  (sirve para pgTAP).

## 3. `src/features/talleres/`
- `types.ts`: `Taller = Tables<'taller'> & { categoria: Pick<Categoria,'nivel_id'>; destinatario: Destinatario[]; etiqueta: Etiqueta[] }`,
  `ETIQUETA_ESTADO satisfies Record<EstadoTaller, string>`, `idDeRuta`, `NIVELES`, `DESTINATARIOS`.
- `consultas.ts` (solo supabase): `obtenerTalleres()` con `select('*, categoria(nivel_id), destinatario(*), etiqueta(*)')`, `guardarTaller`,
  `cambiarEstadoTaller`. `errores.ts` y `filtrar.ts` puros.
- Hooks sobre la clave única `['talleres']` con `select`: `useTalleres`, `useTaller`, `useEtiquetasSugeridas`, `useCatalogo`,
  `useTallerPublicado`, `useGuardarTaller`, `useCambiarEstadoTaller`.
- Tests de hooks con `vi.mock('../consultas', () => ({...}))`; los de pantallas mockean `@/features/talleres/consultas` con factory: una
  función nueva usada por la pantalla obliga a sumarla a cada factory.

## 4. Cliente y entorno
- `src/shared/lib/supabase.ts`: `createClient` con sesión en `sessionStorage`; tira error si faltan variables. Sin uso de `supabase.storage`.
- Scripts `db:start`, `db:reset`, `db:types`, `test:db`. `@supabase/storage-js` viene con supabase-js.

## 5. Requisitos (definición v2)
- §5.1: detalle con "listado de sus recursos, con tipo y tamaño. Los videos enlazados se reproducen integrados". Descarga: formulario y luego
  lista de enlaces con tamaño total (corte descargas).
- §5.2: "Gestión de recursos | Carga, reemplazo y eliminación de los archivos y enlaces de cada taller."
- §5.3: baja física "en la base y en Storage. El reemplazo sube el archivo nuevo y elimina el anterior"; formatos "PDF, PPTX, DOCX, imágenes y
  MP4 como archivo; videos también como enlace a YouTube (recomendado)"; "50 MB por archivo". Baja del taller oculta sus recursos.
- §8.3 `recurso`: `id`, `taller_id` FK, `nombre varchar(200)`, `tipo` (PDF, PPTX, DOCX, IMAGEN, VIDEO, ENLACE), `ruta_archivo varchar(500)`,
  `url varchar(500)`, `tamanio_bytes bigint`, `orden smallint NOT NULL`. CHECK archivo xor enlace.
- §8.4: bucket privado para talleres con enlaces firmados; públicos para normativas y logo. Videos con `youtube-nocookie.com` (0009).
- No hay requisito de vista previa ni de cómo se ordena (solo la columna `orden`).

## 6. Riesgos detectados
1. Dos sistemas sin transacción común (Postgres y Storage): cualquier alta, reemplazo o baja puede dejar huérfanos o referencias rotas.
2. Storage sin guardias ni tests; la skill supabase-rls no lo cubre.
3. Recursos solo pueden subirse después del primer guardado del taller.
4. `FileDropzone` compartido con normativas.
5. Sin Edge Functions: el público no podrá descargar archivos hasta el corte descargas.
