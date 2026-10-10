# Normativas en Supabase (corte normativas)

- **Estado:** implementada
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-10

## Objetivo
Las escuelas consultan y descargan las normativas del Ministerio sin formulario, y el administrador las gestiona con su archivo PDF.
Se migra el dominio de mocks a Supabase (0012), con un bucket público (0007) y el orden de operaciones de 0016.

## Criterios de aceptación
1. Dado un admin, cuando carga título, número, año, etiquetas y un PDF, la normativa aparece en el portal y en el panel. Si ya existe el
   mismo número y año (sin distinguir mayúsculas, tildes ni espacios de los extremos), el alta se rechaza con un mensaje claro y el archivo
   subido se compensa (0016).
2. Validación del formulario (zod), con los mismos límites que la base:
   - título obligatorio, hasta 200 caracteres;
   - número obligatorio, hasta 50;
   - año entre 1900 y 2100;
   - PDF de hasta 20 MiB.

   Si el cliente igual envía un archivo inválido, el bucket lo rechaza (413/415) con el mismo mensaje.
3. Dado un admin que edita, cuando no elige archivo se conserva el que está en la base (no el de la caché). Cuando elige uno, se reemplaza:
   sube el nuevo, actualiza la fila y borra la ruta anterior que devuelve la RPC. El contador `descargas` se conserva.
4. Dado un admin que elimina una normativa (con confirmación), se borra la fila y después el archivo. Las etiquetas quedan.
5. Dado un visitante, cuando busca, la lista filtra por título, número, descripción y etiquetas, sin distinguir mayúsculas ni tildes.
   El orden es año descendente y luego `id` descendente; la Home muestra las tres primeras.
6. Dado un visitante, cuando pulsa "Descargar", el PDF público se abre en otra pestaña (`<a target="_blank">`). El `onClick` llama a la RPC
   del contador sin esperar la respuesta, solo la primera vez por normativa en la visita (`sessionStorage`). Si el contador falla, la
   apertura no se interrumpe.
7. El contador sube sin auditar ni cambiar `updated_at`. Toda alta, edición (también sin cambios) y baja deja una fila en `registro_operacion`.
   Un `update ... set descargas` del admin da `42501`.
8. Seguridad (pgTAP):
   - para `anon`:
     - insert, update y delete en `normativa` y `normativa_etiqueta` dan `42501` o afectan 0 filas;
     - no tiene EXECUTE sobre `guardar_normativa` ni `resolver_etiquetas`;
     - tiene EXECUTE sobre `contar_descarga_normativa`;
   - la escritura de objetos del bucket la hace solo el admin;
   - la guardia **global** de Storage falla si alguna política de `storage.objects` de insert, update, delete o all no es solo
     `{authenticated}` con `es_admin`.
9. Las etiquetas sugeridas en los formularios de taller y de normativa salen de la tabla `etiqueta`, así que se comparten entre ambos.

## Diseño
**Fase A (base).** Primer commit: `resolver_etiquetas(text[]) returns int[]`, extraída de `guardar_taller` (`create or replace`).
- Es invoker, sin EXECUTE para `public` ni `anon` y con EXECUTE para `authenticated`.
- `talleres.test.sql` en verde.

Luego `supabase/migrations/<ts>_normativas.sql`:
- Tabla `normativa` (§8.3):
  - CHECK de `titulo` y `numero` no vacíos;
  - `anio` entre 1900 y 2100;
  - índice único sobre (`lower(inmutable_unaccent(btrim(numero)))`, `anio`);
  - `ruta_archivo` unique con `CHECK ~ '^[0-9a-f-]{36}\.pdf$'`;
  - grant de UPDATE solo sobre `titulo, descripcion, numero, anio, ruta_archivo`.
- Puente `normativa_etiqueta`, igual que `taller_etiqueta`. RLS: select público; insert, update y delete solo del admin, sin estado.
- Triggers:
  - auditoría `after insert or delete`;
  - auditoría `after update when (old.descargas = new.descargas)`;
  - `tocar_updated_at` `before update` con el mismo `WHEN`.
- RPCs:
  - `guardar_normativa(...)`:
    - invoker, solo `authenticated`; guarda la fila (con `numero` recortado) y las etiquetas en una transacción;
    - `p_ruta_archivo` nulo conserva el archivo;
    - devuelve `id` y la ruta anterior, leída con `for update`.
  - `contar_descarga_normativa(p_id int) returns void`:
    - security definer, `search_path=''`;
    - sin EXECUTE para `public`; con EXECUTE para `anon` y `authenticated`;
    - con un id inexistente no hace nada.
- Bucket `normativas`: público, 20 MiB, solo `application/pdf`. Políticas select, insert y delete para el admin; sin update.
- Tests: `supabase/tests/normativas.test.sql` y `storage_global.test.sql` (con autoverificación). Después se corre `npm run db:types`.

**Fase B (frontend).** Primer commit: `src/shared/lib/storage.ts`, que recibe el bucket como parámetro:
- `subirArchivo`, `borrarArchivo`, `compensar` y `borrarOAvisar`;
- `esRechazoDelServidor`, privado;
- `recursos` pasa a usarlo y sus tests siguen en verde.

Después:
- `src/features/etiquetas/`: `consultas.ts` y `useEtiquetas` (`['etiquetas']`). Reemplaza a `useEtiquetasSugeridas`. Las mutaciones de
  taller y de normativa invalidan esa clave.
- `src/features/normativas/`:
  - `types.ts` derivado (fila + `etiqueta: Etiqueta[]`);
  - `archivos.ts` (validación de PDF y `rutaNueva()` = `<uuid>.pdf`, porque el id no existe al subir);
  - `consultas.ts` (incluye la URL pública);
  - `secuencias.ts` (alta, reemplazo y baja);
  - `errores.ts` (23505, 413 y 415);
  - `filtrar.ts` (usa `normalizar`);
  - hooks delgados con la clave `['normativas']`;
  - se borra `mocks/`.
- Pantallas:
  - `NormativasPublicPage` y `HomePage`: descarga real.
  - `NormativasAdminPage`: la baja funciona.
  - `NormativaFormPage`:
    - `anio` pasa a número;
    - se va el campo "responsable" (lo cubre la auditoría);
    - el botón pasa a "Guardar";
    - se muestra el archivo actual;
    - un id inválido en `?editar=` muestra "no encontrado".

## Fuera de alcance
- `taller_normativa` (C-02).
- El KPI y las métricas del dashboard (siguen en mock hasta su corte).
- El logo de configuración.
- La limpieza de huérfanos y de etiquetas sin uso.
- Cualquier anti-abuso del contador más allá de `sessionStorage`.

## Verificación de punta a punta
1. `npm run db:reset && npm run test:db` y `npm test`, `npm run lint` y `npm run typecheck` en verde.
2. Con `npm run dev`, como admin:
   - alta de una normativa con un PDF y una etiqueta existente de un taller, que se ve sugerida;
   - repetir el número y año da error;
   - editar sin archivo y con archivo;
   - eliminar.
3. Como visitante:
   - buscar sin tildes;
   - pulsar "Descargar" dos veces: el PDF se abre, `normativa.descargas` sube solo 1 y `registro_operacion` no suma filas.
