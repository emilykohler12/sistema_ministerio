# Notas de implementación — Historial de operaciones (#20)

## Verificación de `PGRST103` contra el PostgREST local (critica.md, Respuesta 2)

Hecha el 2026-10-18 con `npm run db:reset` y un GET con el token de `admin@dam.local`:
`GET /rest/v1/registro_operacion?select=*&order=id.desc&limit=50&offset=50` con `Prefer: count=exact`.

- Con la tabla vacía: `416 Requested Range Not Satisfiable`, `{"code":"PGRST103","details":"An offset of 50 was requested, but there are only 0 rows.", ...}`.
- Con 1 fila (después de un `PATCH` a `configuracion`): el mismo `416` y `PGRST103` ("only 1 rows").
- El error no trae el conteo en un campo; solo en el texto de `details`. Por eso `consultas.ts` devuelve `{ filas: [], total: null }` y la página
  muestra el vacío con "Limpiar filtros".

También por REST: `usuarios_historial` da `[{id, email}]` al admin, `42501` a `sin-permiso@dam.local` (que además ve `[]` en `registro_operacion`) y
`42501 permission denied for function` a anon.

## Desvíos respecto de la spec

- `usuarios_historial` es plpgsql y no `language sql`: una función `sql` no puede lanzar el `42501` (spec y `historial.test.sql` ajustados).
- `HistorialPage.test.tsx`: el helper `renderPagina` espera el estado vacío (y no la tabla) cuando los datos vienen vacíos.
- Ronda de correcciones: las fechas del filtro usan borrador local con espera de 300 ms y `replace` (como `SelectorPeriodo`); la paginación no se
  deshabilita durante `isPlaceholderData` y el foco pasa al total al llegar la página; `nombreDeUsuario` es una función pura del dominio; el botón de la
  fila tiene un nombre fijo (`Cambios de <descripción>`); `fechaReal` rechaza el año 0000.

## Pendiente (issue aparte, fuera del corte)

- Unificar el rango de fechas (`ui/RangoFechas`) y mover `esFechaReal`, `sumarDias` y la zona a `shared/lib/date.ts`; toca el dashboard (va a #39).
