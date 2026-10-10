# Contexto: descargas (Explore, 2026-10-10)

## Código actual
- `src/features/descargas/DescargaModal.tsx`: stub huérfano (nadie lo importa).
  - Zod `{escuela, localidad, rol}` con strings libres, `LOCALIDADES` y `ROLES` hardcodeados.
  - `onSubmit` es un `setTimeout`.
  - Usa `Dialog`, `Select`, `AutocompleteInput`, `Label`, `FieldError` y `Button`.
- `src/features/descargas/useNombresInstitucionSugeridos.ts`: stub que devuelve `[]`. Sin tests, tipos ni consultas.
- `src/pages/public/TallerDetallePage.tsx`:
  - usa `useTallerPublicado(idDeRuta(id))` (`:16`) y `<ListaRecursos recursos={taller.recurso} />` (`:91`);
  - tiene un botón "Compartir" sin acción (`:93-97`) y ningún "Descargar";
  - `TallerDetallePage.test.tsx:103-106`, `:162` y `:206-210` afirman que **no** hay descarga, así que hay que cambiarlos.
- `src/features/talleres/hooks/useTalleres.ts`: clave única `CLAVE_TALLERES = ['talleres']`. `useTallerPublicado` filtra en el cliente.
- `Recurso = Tables<'recurso'>`:
  - campos `id`, `taller_id`, `nombre`, `tipo` (`PDF|PPTX|DOCX|IMAGEN|VIDEO|ENLACE`), `ruta_archivo`, `url`, `tamanio_bytes` y `orden`;
  - el archivo y el enlace son excluyentes (xor);
  - `ruta_archivo` es `<taller_id>/<uuid>.<ext>`, `varchar(500) unique` (ya tiene índice).
- `src/features/recursos/components/ListaRecursos.tsx`:
  - muestra nombre, tipo, tamaño y "Tamaño total";
  - los enlaces de YouTube van integrados y los demás enlaces como `<a target=_blank>`;
  - los archivos no se pueden descargar.
- `formatearTamanio` (`recursos/archivos.ts:90`), `ETIQUETA_TIPO_RECURSO` (`recursos/types.ts`).
- `src/features/establecimientos/hooks/useEstablecimientos.ts` (sirven para anon sin cambios):
  - `useLocalidades()` (`['localidades']`, `staleTime: Infinity`);
  - `useEstablecimientos(localidadId | null)` (`['establecimientos', id]`).
- RLS del padrón:
  - anon ve las 79 localidades y los establecimientos `activo`;
  - el nombre es único por localidad (`establecimiento_localidad_nombre_uniq`).
- Patrón de formulario: `src/features/recursos/components/DialogoRecurso.tsx`.
  - Zod con `.trim().min().max()` y `.refine`.
  - El hijo se monta al abrir.
  - Usa `errorEnvio` y `mensajeDeError`.
- UI disponible: `Dialog` (max-w-md, `className` para ensanchar), `Select` nativo con `forwardRef`, `AutocompleteInput`, `Badge`,
  `Button`, `FieldError`, `Label`, `Input`, `EmptyState`, `Skeleton`. No hay `Combobox`.
- `src/shared/lib/supabase.ts`:
  - cliente con la clave publicable;
  - no hay `functions.invoke` en ningún lado;
  - `storage.ts` no tiene nada para firmar URLs.

## Base
- Bucket `talleres` (`*_recursos.sql:138-172`): privado, con select, insert y delete solo para `authenticated` + `es_admin()`. Anon no puede firmar URLs.
- `recurso_select`: `exists (select 1 from taller t where t.id = taller_id)`. Anon ve los recursos de talleres publicados por herencia de la RLS de `taller`.
- `contar_descarga_normativa` (`*_normativas.sql:222-234`): `security definer`, `search_path=''`, sin EXECUTE para `public`, con EXECUTE para `anon` y `authenticated`. Es el patrón de RPC anónima.
- Guardias:
  - `auditoria_global` exige `auditar()` en toda tabla de `public`. Su única excepción es `registro_operacion`, en un array literal que aparece en dos consultas.
  - `rls_global` y `truncate_global` no tienen excepciones.
  - `updated_at_global` solo alcanza a tablas con `updated_at`.
  - `storage_global` solo controla las políticas de escritura de `storage.objects`; las de SELECT quedan fuera.

## Entorno
- `supabase/functions/` no existe. `config.toml` tiene `[edge_runtime]` con Deno 2 en un contenedor propio.
- El Dev Container no instala Deno.
- Lint, typecheck y Vitest no cubren Deno, y no hay ningún script npm para `functions serve` ni `functions deploy`.
- Los perfiles de bash de los subagentes (`perfiles.mjs`) no permiten comandos de funciones.
- `.claude/rules/migraciones.md`: "anon solo lee contenido publicado e inserta registros de descarga".

## e2e
- `e2e/portal.spec.ts` y `e2e/recursos.spec.ts` visitan `/talleres/<id>` como anon.
- `helpers.ts` tiene `loginAdmin`, `crearTaller` y `sufijoUnico`.
- Ningún e2e prueba la descarga.
