# Padrón de establecimientos — fase A (base y ABM)

- **Estado:** implementada (fase A)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-10

## Objetivo
Dejar en la base las localidades y los establecimientos, gestionables desde el panel. Es la base del corte descargas (0010):
el formulario necesita la lista localidad → institución, y las métricas necesitan saber qué establecimiento descargó. La carga
masiva por script es la fase B y espera la muestra del padrón (C-08), porque su formato es lo único que depende de ella (0010).

## Criterios de aceptación
1. Dado cualquier rol de la API, cuando lee `localidad`, entonces obtiene los 79 municipios de `localidades.md`. Ningún rol de la API puede escribir en la tabla.
2. Dado anon o authenticated sin marca de admin, cuando lee `establecimiento`, entonces ve solo los activos y no puede insertar ni actualizar (42501 o 0 filas).
3. Dado el admin, cuando crea o edita un establecimiento con un nombre que ya existe en esa localidad, entonces el formulario marca el campo nombre como duplicado. Cuenta como duplicado aunque difieran mayúsculas, tildes o espacios en los extremos, y aunque el existente esté inactivo.
4. Dado el admin, cuando crea o edita un establecimiento con un CUE que ya existe, entonces el formulario marca el campo CUE como duplicado.
5. Un CUE con algo que no sean dígitos se rechaza en el formulario y en la base. Un CUE vacío se guarda como `NULL`.
6. Si la base devuelve un 23505 que no es ninguno de esos dos, el formulario muestra un error general.
7. Dado el admin, cuando elige una localidad en `/admin/establecimientos`, entonces ve todos sus establecimientos, con los inactivos marcados "Inactivo". Puede:
   - buscarlos por nombre o CUE, sin tildes;
   - crear;
   - editar;
   - dar de baja, con confirmación;
   - reactivar.
8. Sin localidad elegida, la pantalla pide elegir una. Si la localidad no tiene establecimientos, muestra un estado vacío con "Nuevo establecimiento".
9. La localidad elegida queda en la URL (`?localidad=<id>`). Después de crear o editar, se vuelve al listado de la localidad que quedó guardada.
10. Un id inválido o inexistente en `/admin/establecimientos/:id/editar` muestra "no encontrado".

## Diseño
- `supabase/migrations/<ts>_padron.sql`:
  - `localidad`:
    - `id smallint` explícito, del 1 al 79 en orden alfabético;
    - `nombre varchar(100)` con `btrim <> ''` y único normalizado;
    - sin timestamps.
    - Las filas van en la migración. Solo SELECT para `anon, authenticated`. Lleva `auditar()`.
  - `establecimiento`:
    - Columnas:
      - `id int` identity;
      - `cue varchar(20)` null, con la constraint `establecimiento_cue_key unique` y `CHECK (cue ~ '^[0-9]{1,20}$')`;
      - `nombre varchar(200)` con `btrim <> ''`;
      - `localidad_id` FK not null;
      - `activo`, `created_at` y `updated_at`.
    - Índice `establecimiento_localidad_nombre_uniq` sobre `(localidad_id, lower(inmutable_unaccent(btrim(nombre))))`.
    - RLS: select con `activo or es_admin()`; insert y update solo admin; sin delete.
    - Grant de UPDATE solo sobre `(cue, nombre, localidad_id, activo)`.
    - Triggers `auditar()` y `tocar_updated_at()`.
- `supabase/tests/padron.test.sql`:
  - las 79 filas;
  - RLS por rol;
  - unicidad normalizada;
  - CHECK del CUE;
  - grants;
  - `throws_ok` con el nombre de cada constraint en el mensaje (fija el contrato del criterio 6).
- `src/features/establecimientos/`:
  - `types.ts`: `Localidad` y `Establecimiento`, derivados de `database.ts`.
  - `consultas.ts`: `obtenerLocalidades`, `obtenerEstablecimientos(localidadId)`, `obtenerEstablecimiento(id)`, `crearEstablecimiento` y `actualizarEstablecimiento`.
  - `errores.ts`: puro; distingue `cue` de `nombre` por el nombre de la constraint dentro de `message`.
  - `filtrar.ts`: búsqueda por nombre o CUE, sin tildes.
  - `hooks/`:
    - `useLocalidades` (`['localidades']`, `staleTime: Infinity`);
    - `useEstablecimientos(localidadId)` (`['establecimientos', localidadId]`, habilitado solo con una localidad);
    - `useEstablecimiento(id)` (`['establecimientos', 'detalle', id]`);
    - mutaciones que invalidan `['establecimientos']`.
- `src/pages/admin/establecimientos/`:
  - `EstablecimientosPage.tsx`: `Select` de localidad, `Buscador` y tabla. Sigue el patrón de `NormativasAdminPage`, con baja y reactivación como en `CategoriasPage`.
  - `EstablecimientoFormPage.tsx`:
    - zod espejo de la base: `trim`, y el CUE vacío pasa a `null`;
    - localidad precargada desde `?localidad=`;
    - rutas `/admin/establecimientos/nuevo` y `/admin/establecimientos/:id/editar`.
- `src/app/router.tsx` y `AdminSidebar.tsx`: rutas y entrada "Establecimientos".
- Decisiones de la entrevista:
  - nombre único por localidad, también contra los inactivos;
  - CUE opcional, solo dígitos y editable;
  - municipios de la lista revisada en `localidades.md`;
  - el listado se filtra por localidad, por el tope de 1000 filas de PostgREST;
  - los inactivos se ven en el mismo listado, marcados.

## Fuera de alcance
- **Fase B, el script de carga.** Arranca con la muestra (C-08). Arrastra de la entrevista y de `critica.md` (puntos 2 a 4):
  - upsert por CUE, sin desactivar;
  - un choque con un establecimiento manual se rechaza y se reporta;
  - simulación por defecto;
  - local por defecto y `--confirmar=<host>` para la nube, con bloqueo en `proteger-bash`;
  - limpieza del nombre (U+00A0);
  - typecheck de `scripts/`.
- Formulario de descarga, `registro_descarga`, "instituciones sin vincular", métricas y el stub `useNombresInstitucionSugeridos`.
- Gestión de localidades desde el panel (un cambio va por migración) e importación periódica (0010).
- Nivel del establecimiento: si la muestra lo pide, se agrega `establecimiento_nivel`.

## Verificación de punta a punta
1. `npm run db:reset` y `npm run test:db` en verde, guardias globales incluidas. Luego `npm run db:types`.
2. `npm run dev`. Como admin, en `/admin/establecimientos`:
   - aparece el pedido de elegir localidad;
   - al elegir Posadas, se ve el estado vacío;
   - crear dos establecimientos y buscarlos por nombre (sin tildes) y por CUE.
3. Crear otro con el mismo nombre en la misma localidad (variando tildes y mayúsculas) y otro con un CUE repetido: cada formulario marca el error en su campo. Repetirlo al editar.
4. Editar uno cambiándole la localidad: se vuelve al listado de la localidad nueva.
5. Dar de baja y reactivar. En otra pestaña sin sesión (anon), la consulta a `establecimiento` no devuelve el inactivo.
6. `npm test`, `npm run lint`, `npm run typecheck` y `npm run build` en verde.
