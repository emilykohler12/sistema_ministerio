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

# Notas de implementación — padrón fase B

Spec: `fase-b.md`. Decisión: ADR 0019.

## Decisiones
- `leerFilas` numera por registro del CSV (el encabezado es la fila 1). Las líneas en blanco se saltan sin alterar la numeración. Una celda multilínea cuenta como un registro, así que el número puede diferir de la línea física del editor.
- `planificar` registra un CUE como visto cuando la fila pasó la validación de CUE, nombre y localidad. Una fila posterior con el mismo CUE se rechaza como repetida aunque la primera haya sido rechazada por chocar con la base.
- Los choques se detectan contra la base tal como está, no contra el estado resultante del plan. Si un cambio libera un (localidad, nombre) que otra fila del mismo CSV quiere usar, esa segunda fila se rechaza por "ya existe"; una segunda corrida la acepta. Es conservador y el 23505 de la base es la red de seguridad.
- El nombre de la base se compara con el nombre ya limpio: un nombre de la base con espacios de más recibe un cambio que lo limpia.
- Un 23505 al escribir agrega un rechazo y sigue. Cualquier otro error de escritura interrumpe la carga (se informa lo escrito hasta ahí) y sale con 1: un error de red o de permisos repetido por miles de filas no aporta nada.
- Las altas se escriben antes que los cambios.
- `resolverDestino` trata una `SUPABASE_URL` local como destino local (usa `supabase status`); solo una URL remota exige clave y la confirmación del host.
- El informe lista todas las altas y cambios, no solo los conteos, para poder revisar la simulación.
- `seed-usuarios.mjs` ahora importa `esUrlLocal` de `scripts/lib/entorno.ts` (Node 24 ejecuta el `.ts` desde un `.mjs`); `npm run db:reset` lo verificó.
- `proteger-bash` bloquea cuando el comando completo menciona el script y además la confirmación de host o `SUPABASE_URL`, sin separar por segmentos (cubre un `export SUPABASE_URL=...` seguido del script con `&&`). Falso positivo aceptado: un comando que solo nombra esas cadenas, por ejemplo un heredoc que escribe documentación. Pasó al escribir estas notas, que por eso se editaron con Edit.
- `ejemplo.csv` trae 6 altas y 7 rechazos (uno por cada motivo de validación y de choque dentro del CSV). Los casos que dependen de la base (cambios, "ya existe", "choca") se cubren en `planificar.test.ts`; los cambios también se probaron a mano con un segundo CSV sobre la base local.

## Correcciones de la crítica y la revisión de la fase B (`critica.md`, `revision-fase-b.md`)
- `parsearCsv`: solo una `"` al principio de una celda abre el modo comillas; en medio de una celda es literal. Una comilla sin cerrar al final del archivo lanza un error con el número de registro donde se abrió (antes se tragaba el resto del archivo sin avisar). Tests en `csv.test.ts`.
- `decodificarCsv(bytes)` en `csv.ts`: `TextDecoder('utf-8', { fatal: true })`, que además quita el BOM. Un archivo que no es UTF-8 (el "CSV" de Excel en español es Windows-1252) aborta antes de leer la base, con un mensaje que dice cómo exportarlo ("CSV UTF-8"). Test con bytes cp1252; verificado a mano con un CSV cp1252 (exit 1, sin escribir).
- `planificar`: las equivalencias se buscan con `Object.hasOwn`; `constructor`, `__proto__` y `toString` quedan como "localidad desconocida". Tests nuevos.
- Con `--aplicar`, el Resumen informa lo escrito (altas y cambios escritos) y los rechazos totales, incluidos los 23505 al escribir. En simulación sigue informando el plan.
- `traerTodo` corta con una página vacía y avanza por la cantidad recibida, así que no depende de `max_rows` del servidor (cuesta una request más).
- `scripts/lib/supabaseLocal.ts` (`supabase status`, `SERVICE_ROLE_KEY ?? SECRET_KEY` y la guardia `esUrlLocal`) lo usan `seed-usuarios.mjs` e `importar-padron.ts`; se borró la copia. Va aparte de `entorno.ts` para que este siga puro. No tiene test de Vitest porque ejecuta la CLI; lo ejerce `npm run db:reset`.
- No se aplicó el menor 1 (evasión del hook con comillas o escapes): coincide con el límite que ya acepta el comentario de `SUPABASE_REMOTO`.
- Límite conocido (menor 5): `normalizar` (NFD y diacríticos) no equivale a `unaccent` de la base (`Ø`, `Æ`, `ß`) y el script junta espacios internos que el índice no junta. Ambas direcciones terminan en un rechazo, en el plan o por 23505, sin pérdida de datos.
- Cómo se verificó el 23505 al escribir (criterio 5): lo probó la revisión con el par `Escuela Ø` / `Escuela O`, que pasa el plan y choca en el índice. El orquestador no tiene test automatizado.
- Pendiente de verificar en el navegador (paso 4 de la spec): que las altas aparezcan en `/admin/establecimientos`. No se hizo en esta ronda.

## Desvíos
- Ninguno respecto de la spec. El ejemplo termina con exit 1 porque tiene rechazos a propósito.
