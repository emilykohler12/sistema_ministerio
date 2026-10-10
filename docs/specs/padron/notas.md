# Notas de implementación — padrón fase A

## Desvíos del test `supabase/tests/padron.test.sql` (autorizados por el coordinador, opción B)
Dos aserciones del test del test-writer pedían algo distinto de lo que la spec fija. Se corrigieron las aserciones y no la migración:

1. **Test 44, CUE de más de 20 dígitos**: esperaba `23514` (CHECK). La spec fija `cue varchar(20)`, y Postgres corta 21 dígitos con
   `22001` (`value too long for type character varying(20)`) antes de evaluar el CHECK. Ahora espera `22001` y la descripción dice que el largo lo corta el tipo.
2. **Test 49, UPDATE de `id` por el admin**: esperaba `42501`. Con `id int generated always as identity` (mismo patrón que `categoria`),
   Postgres responde `428C9: column "id" can only be updated to DEFAULT` antes de chequear el grant por columna. Ahora espera `428C9`.

## Decisiones durante la implementación
- Timestamp de la migración: `20261010170000_padron.sql`.
- `localidad` lleva además un índice único normalizado (`localidad_nombre_uniq`) y `check (btrim(nombre) <> '')`, como pide el diseño ("único normalizado").
- Revocado el UPDATE de tabla a `anon` y `authenticated`, con grant por columna a `authenticated`. Por eso el UPDATE de `anon` da `42501` y no 0 filas.
- Formulario: el zod usa `transform` (CUE `''` -> `null`, localidad `string` -> `number`), con `useForm<FormInput, unknown, FormOutput>`. No se muestra hasta que cargan las localidades (y el establecimiento, al editar): un `<select>` sin opciones perdería el valor inicial.
- Una localidad de `?localidad=` que no existe en la lista (una vez cargada) se trata como sin localidad; en el alta se ignora igual.
- Al elegir otra localidad en el listado se limpia la búsqueda.
- `database.ts` se regeneró con `npm run db:types` sin formatear (el script lo avisa): el diff son solo las 34 líneas nuevas.

## Correcciones de la revisión (`revision.md`)
- `idDeRuta` (`src/shared/lib/rutas.ts`) devuelve `null` si el id supera 2147483647 (máximo de `int` en Postgres). Antes, un id fuera de rango llegaba a la base, que respondía 22003, y el formulario mostraba "Reintentar" en vez de "no encontrado". Test en `rutas.test.ts` y en `EstablecimientoFormPage.test.tsx`. El cambio es compartido: aplica a todas las pantallas que usan `idDeRuta`.
- `EstablecimientosPage` consulta solo con una localidad que está en la lista ya cargada: un `?localidad=40000` pide elegir una localidad, sin llamar a `obtenerEstablecimientos` ni mostrar error. Mientras cargan las localidades, con un `?localidad=` en la URL, se ve el esqueleto de la tabla (no el pedido de elegir). Tests nuevos, más los del error de carga de localidades (alert y "Reintentar") en las dos pantallas.
- `padron.test.sql`: se agregó un `results_eq` con los 79 `(id, nombre)` completos de `localidades.md` (las aserciones sueltas se conservan); `plan(51)`.
