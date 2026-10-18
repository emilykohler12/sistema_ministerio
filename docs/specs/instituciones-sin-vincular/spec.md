# Instituciones sin vincular

- **Estado:** aprobada
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-18
- **Issue:** #19

## Objetivo
Las descargas con institución "Otra" no suman a "establecimientos alcanzados" ni a la cobertura. El admin necesita ver esos nombres
agrupados y asignarlos a un establecimiento del padrón (existente o creado en el momento), conservando el texto original (0010).

## Criterios de aceptación
1. Dado registros `OTRA` sin `establecimiento_id`, cuando el admin abre `/admin/establecimientos/sin-vincular`, entonces ve una fila por
   grupo `(localidad_id, lower(unaccent(btrim(institucion_otra))))` con localidad, nombre más frecuente (desempata la forma más reciente),
   otras variantes (`[]` si no hay), descargas y última descarga; orden descargas desc, última desc, localidad, nombre. Cantidad de grupos = `sin_vincular`.
2. Cuando vincula un grupo a un establecimiento **activo de la misma localidad**, todos sus registros sin vincular toman ese `establecimiento_id`;
   `institucion_tipo` sigue `OTRA` e `institucion_otra` no cambia. El grupo desaparece, `sin_vincular` baja 1 y, en un período que incluya
   esas descargas, alcanzados suma 1 si el establecimiento era nuevo. Cada UPDATE queda en `registro_operacion`.
3. "Crear establecimiento" abre un formulario con el nombre del grupo (editable), CUE opcional y la localidad fija; al guardar crea y vincula.
   Con nombre duplicado (también inactivo) se ve el error de siempre y una guía a "Vincular" o a reactivar. Si crea pero falla la vinculación,
   "Reintentar" solo vincula con el id ya creado.
4. Vincular a un establecimiento inactivo o de otra localidad lo rechaza la base (`DA005`) con un mensaje claro; el diálogo solo ofrece activos.
5. Si otro admin ya vinculó el grupo, la RPC devuelve 0 y la pantalla avisa "Ya estaba vinculado". En éxito, 0 o error, la lista se refresca.
6. Sin la marca de admin, listar y vincular dan `42501`; anon no tiene EXECUTE. Un UPDATE directo sobre `registro_descarga` sigue en 42501.
7. Estados: vacío "No hay instituciones sin vincular", carga con `TableSkeleton`, error con `ErrorFallback` y reintentar (también en el diálogo).
8. El aviso del dashboard pasa a ser un enlace a la pantalla (mismo texto).
9. Accesible por teclado: el foco no salta mientras se escribe en el buscador del diálogo; selección por radios en un `fieldset`; el resultado se
   anuncia en un `role="status"` y el foco vuelve al encabezado de la tabla.

## Diseño
- `supabase/migrations/<ts>_vinculacion.sql`:
  - `instituciones_sin_vincular()` returns table (`localidad_id, localidad, nombre, variantes text[], descargas, ultima`): invoker,
    `search_path` vacío, EXECUTE solo `authenticated`, `42501` sin `es_admin()`. Misma clave que `metricas_resumen` (pgTAP compara ambos conteos).
  - `vincular_institucion(p_localidad_id, p_nombre text, p_establecimiento_id) returns int`: **definer**, `es_admin()` → `42501`; normaliza
    `p_nombre`, bloquea el establecimiento con `for share` y exige activo y de `p_localidad_id` (`DA005`); actualiza solo `establecimiento_id`
    donde `OTRA and establecimiento_id is null`. **Sin grant de UPDATE ni política** sobre `registro_descarga` (molde 0017/0022).
- `src/shared/hooks/useFocusTrap.ts`: `onClose` en un ref, deps `[active, ref]` (+ test). Bug existente que esta pantalla expone.
- `src/features/establecimientos/`: `esquema.ts` (zod y mensajes que hoy viven en `EstablecimientoFormPage`), `types.ts` (`GrupoSinVincular`
  de `Returns`), `consultas.ts` (+2 RPC), `errores.ts` (`DA005`), hooks `useSinVincular` (`['establecimientos', 'sin-vincular']`) y `useVincular`
  (invalida esa clave y `['dashboard']` en `onSettled`).
- `src/pages/admin/establecimientos/SinVincularPage.tsx`: tabla a mano, filtro por localidad con opciones tomadas de los grupos y dos `Dialog`
  hermanos: "Vincular" (`Buscador` + radios de los activos de la localidad, vía `useEstablecimientos`) y "Crear establecimiento".
- Ruta en `router.tsx`; enlace desde `EstablecimientosPage` y desde el aviso de `DashboardPage` (se actualizan su test y la spec del dashboard).
- **Decisiones:** (a) vincular conserva `OTRA` (pasar a `PADRON` obliga a borrar el texto); (b) solo la misma localidad, porque
  `metricas_por_localidad` cuenta descargas por la localidad declarada y alcanzados por la del establecimiento; (c) crear y vincular en dos
  llamadas: si falla la segunda queda un establecimiento válido y nada que compensar; (d) escritura solo por RPC definer.

## Fuera de alcance
- Desvincular o corregir una vinculación (queda en auditoría; se haría con otra RPC).
- Descartar grupos basura ("asdf") y alias que vinculen automáticamente las descargas futuras con el mismo nombre.
- Paginación (tope de 1000 grupos de PostgREST) y unir grupos con variantes de espacios internos o abreviaturas.

## Verificación de punta a punta
Con `db:reset`: tres descargas anónimas "Otra" en Posadas ("Escuela 123", "escuela 123 ", "Escuela 999"). Como admin, la pantalla muestra
dos grupos (2 y 1 descargas); el dashboard dice "2 instituciones sin vincular" con enlace. Vincular "Escuela 123" a un establecimiento
existente y crear "Escuela 999": la lista queda vacía, el dashboard ya no muestra el aviso y alcanzados (30 días) suma 2.
