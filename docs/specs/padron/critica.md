# Crítica de la spec: corte padrón

Crítico de diseño, 2026-10-10, sobre `spec.md` (borrador) y `contexto.md`. Lo marcado como **verificado** lo probé en la base local
(`docker exec supabase_db_sistema_ministerio psql`, dentro de `begin ... rollback`) o con Node 24.21 en el scratchpad.

## Veredicto
Hay mejoras. El esquema, la RLS, los grants y la auditoría están bien y no chocan con las guardias. Lo que sobra es la capa del
script que depende del formato del CSV, que todavía no conocemos (C-08). Además, la protección de la nube depende de un flag que
un agente también puede pasar.

## Puntos

### 1. La parte del script que depende del formato se diseña contra un CSV inventado (severidad: media)
- **Problema:** C-08 sigue abierta y la carga real está fuera de alcance. Aun así, el corte trae un parser propio, columnas fijas
  `cue,nombre,localidad`, UTF-8 y `equivalencias.json`. Son justo las piezas que más pueden cambiar con la muestra real: un XLSX o
  un CSV en Windows-1252, una fila por nivel, "localidad" con parajes en lugar de municipios. El núcleo, en cambio, **no** está
  sobredimensionado. La idempotencia hace falta igual: el script se va a correr en local, después en la demo, después en producción,
  y otra vez cada vez que se corrijan rechazos. Y la simulación es un `if` sobre un plan puro, así que cuesta poco.
- **Propuesta:** partir el corte en dos fases, como en los anteriores.
  - **Fase A:** migración, pgTAP, feature y pantallas. El ABM ya permite cargar escuelas de prueba y probar todo el resto.
  - **Fase B, cuando llegue la muestra:** `planificar.ts` (tal como está en la spec), el lector del formato real y la guardia de la
    nube (punto 3).
  - Si el script tiene que estar ahora sí o sí, que no lleve `equivalencias.json`. La localidad se compara por nombre normalizado y,
    si no hay coincidencia, la fila se rechaza ("localidad sin equivalencia" ya está en el criterio 9). El archivo se agrega cuando
    el informe muestre rechazos reales.
- **Alternativa descartada:** cargar el CSV con `\copy` a una tabla de paso y resolverlo en SQL. La normalización sería la del
  índice y la simulación saldría con `begin ... rollback`. Pero contra la nube necesita la cadena de conexión de la base, que
  `proteger-bash` bloquea (`--db-url`), y cambia de herramienta según el entorno.
- **Por qué:** no se escribe ni se testea dos veces el código del formato, y la fase A no espera a una respuesta externa.

### 2. El plan copia en JS el índice único con otra semántica, y la escritura no dice qué hace ante un 23505 (severidad: media)
- **Problema:** `planificar.ts` predice "(localidad, nombre) repetido" y "cambio que choca" con su propia normalización, pero quien
  decide es `lower(inmutable_unaccent(btrim(nombre)))`. **Verificado:** `btrim` no quita el espacio duro (U+00A0, común en
  exportaciones de Excel) y `String.trim()` sí. `unaccent` convierte `ß`/`Œ` y `normalizar` no. Si el plan dice "alta" y la base
  responde 23505, la spec no dice si se aborta todo o solo esa fila.
- **Propuesta:**
  - Limpiar el nombre antes de comparar **y** de guardar: `nombre.replace(/\s+/gu, ' ').trim()`. Así lo que se guarda no tiene
    caracteres en los que JS y Postgres difieren. Para lo demás, usar el `normalizar` de `src/shared/lib/texto.ts` (punto 4).
  - Escribir fila por fila. Si una fila da 23505, se registra como rechazo con su número de fila y el script sigue. Sumarlo al
    criterio 9 ("choque detectado al escribir"). Para unas pocas miles de filas, una carga única de un par de minutos contra la nube
    alcanza. Un lote de `upsert` evita ese tiempo, pero un solo error lo hace fallar entero.
- **Por qué:** el criterio 9 ("las filas válidas se procesan igual") se cumple también cuando el plan se equivoca o alguien edita
  desde el panel entre la simulación y `--aplicar`.

### 3. `--confirmar` es un flag que un agente también puede pasar (severidad: media)
- **Problema:** el criterio 10 protege la nube con `SUPABASE_SERVICE_ROLE_KEY` y `--confirmar`. `proteger-bash.mjs` no ve
  `padron:importar`: su regex mira `supabase` y `npm run db:*`. Si la clave queda en el entorno o en un archivo, nada impide que un
  agente corra el script contra la nube (CLAUDE.md: "nunca conectes agentes a la base de producción"). Además, un `--confirmar` sin
  valor no distingue el proyecto de demo del de producción.
- **Propuesta:**
  - `--confirmar=<host>`: el script aborta si el valor no coincide con `new URL(SUPABASE_URL).hostname`.
  - Sumar a `proteger-bash.mjs` el bloqueo de `padron:importar` / `importar-padron` con `--confirmar` o con un `SUPABASE_URL=https`
    en el mismo comando. Es el mismo molde de regex cruda que ya usa (`[^;&|\n]*?`).
  - Que la spec diga que la clave se pasa solo en el comando del usuario y nunca se guarda en un archivo del repo.
  - Sacar `leerEstado` y `esUrlLocal` de `seed-usuarios.mjs` a un `scripts/lib/supabase-local.mjs` que importen los dos scripts.
    **Verificado:** un `.ts` que corre Node 24 importa `.mjs` sin problema.
- **Por qué:** la barrera ya no depende de la buena fe del que corre el script, y la guardia del host local no queda copiada.

### 4. Ejecutar `.ts` con Node: imports relativos con extensión, y `scripts/` no lo revisa `tsc` (severidad: media)
- **Problema:**
  - **Verificado** con Node 24.21: un import relativo con `.ts` funciona (también `import type` desde `database.ts`). `@/...` da
    `ERR_MODULE_NOT_FOUND`, y un import sin extensión también.
  - `tsconfig.app.json` incluye solo `src` y `tsconfig.node.json` incluye solo `vite.config.ts` y `src/test/hooks`. O sea que
    `scripts/` no lo revisa nadie, y el "`npm run typecheck` en verde" de la verificación no dice nada del script.
- **Propuesta:**
  - Agregar `"scripts"` al `include` de `tsconfig.node.json`. Ya tiene `module: nodenext`, que exige extensiones como Node, más
    `allowImportingTsExtensions`, `erasableSyntaxOnly` y `types: ["node"]`.
  - Regla para la spec: los módulos de `scripts/` importan solo módulos puros, por ruta relativa con `.ts`
    (`../../src/shared/lib/texto.ts`, que no tiene imports) y nunca con `@/`.
  - Vitest ya los encuentra. Agregar `// @vitest-environment node` en sus tests evita cargar jsdom sin necesidad.
- **Por qué:** se comparte la normalización sin copiarla, y los errores del script salen en `typecheck` y no recién cuando el
  usuario lo corre contra la nube.

### 5. Distinguir los dos 23505 por el nombre: sirve si el nombre se fija en los dos lados (severidad: baja)
- **Problema:** PostgREST no expone `constraint_name`. El nombre solo viaja dentro de `message`. **Verificado:** con un índice único
  de expresión, Postgres responde `duplicate key value violates unique constraint "categoria_nivel_nombre_uniq"`. Es estable, pero el
  `unique` en línea del CUE se llamaría `establecimiento_cue_key` por defecto y nadie lo fija.
- **Propuesta:**
  - Nombrar los dos explícitamente en la migración (`constraint establecimiento_cue_uniq unique (cue)` y
    `establecimiento_localidad_nombre_uniq`).
  - En `errores.ts`, buscar `"<nombre>"` con las comillas dentro de `message`. Un 23505 que no coincida con ninguno de los dos
    muestra un error general del formulario, no el del campo nombre.
  - En el pgTAP, usar `throws_ok(..., '23505', 'duplicate key value violates unique constraint "establecimiento_cue_uniq"')`, que
    compara el mensaje exacto. Así el contrato queda fijado también del lado de la base.
- **Alternativas peores:** consultar antes de guardar (una carrera más y otra request), o un trigger con códigos `DA00x` (más SQL
  para algo que la base ya dice).

### 6. Huecos menores en los criterios (severidad: baja)
- **CUE vacío en el formulario:** el CHECK rechaza `''`. El zod tiene que transformar `''` en `null`, y el criterio 4 tiene que
  decirlo: "un CUE vacío se guarda como NULL, y dos establecimientos sin CUE no chocan". Es el mismo caso de "default de la base
  contra zod" de cortes anteriores.
- **Fila del CSV sin CUE:** la spec no dice qué pasa. Si se da de alta, la segunda corrida la rechaza por (localidad, nombre) y
  deja de cumplirse el criterio 7. Lo más simple es rechazarla ("sin CUE") y agregarla desde el panel.
- **Criterios 3 y 4:** valen también al **editar**, no solo al crear.
- **Criterio 1:** cambiar "nadie puede escribir" por "ni anon ni authenticated (admin incluido)". `service_role` sí puede, y el
  script lo usa.
- **`useEstablecimiento(id)`:** su clave tiene que colgar de `['establecimientos', ...]` (por ejemplo
  `['establecimientos', 'detalle', id]`). Si no, las mutaciones que invalidan `['establecimientos']` no la refrescan.
- **Después de editar:** la ruta de edición no lleva `?localidad=`. Volver a `?localidad=<localidad_id guardado>`, que puede haber
  cambiado.

### 7. Lo que está bien así (sin cambios)
- **Listado por localidad:** es la misma consulta que va a usar el formulario de descarga (anon, solo activos, localidad →
  institución), así que no es un costo solo del panel. Ninguna localidad se acerca a 1000 filas. Que `obtenerEstablecimientos`
  ordene por `nombre, id` para que el orden sea fijo.
- **RLS y grants:** con el molde de `categoria` alcanza. No hace falta un índice aparte para la FK, porque `localidad_id` encabeza
  el índice único. `localidad` sin políticas de escritura queda igual que `nivel_educativo`.
- **Auditoría con service_role:** `auth.uid()` da NULL, `registro_operacion.usuario_id` acepta NULL ("operación del sistema") y el
  trigger es definer, así que el `revoke ... from service_role` sobre `registro_operacion` no lo afecta. El caso que hace fallar
  cerrada a la auditoría (un `sub` sin fila) no se da.
- **Guardias:** `rls_global` y `auditoria_global` piden RLS y `auditar()` en las dos tablas. `updated_at_global` pide
  `tocar_updated_at()` solo en `establecimiento`. TRUNCATE ya lo cubren los privilegios por defecto. No choca nada.
- **`useLocalidades` con `staleTime: Infinity` en lugar de una constante como `NIVELES`:** son unos 78 municipios. Copiarlos en TS
  y en SQL agrega una fuente de desfase sin ganar nada visible.

## Respuesta

1. **Acepto, pendiente de que el usuario lo confirme** (cambia el alcance que acordamos en la entrevista). Fase A: base, dominio y ABM. Fase B: el script, cuando llegue la muestra (C-08). El parser, las columnas fijas y las equivalencias armadas contra un CSV inventado son justo lo que 0010 dice que depende de la muestra. El plan puro, la simulación y la idempotencia quedan como requisitos de la fase B.
2. **Acepto para la fase B**: limpiar el nombre (incluido U+00A0) antes de comparar y de guardar, y tomar el 23505 de la escritura como rechazo de la fila. En la fase A aplica una parte: el zod del formulario hace `trim` y la base es la que decide la unicidad.
3. **Acepto para la fase B**: `--confirmar=<host>`, `esUrlLocal` en un módulo compartido y el bloqueo del script en `proteger-bash` (es un cambio de hooks: requiere el OK del usuario).
4. **Acepto para la fase B**: imports relativos con `.ts` y `scripts/` dentro de `tsconfig.node.json`.
5. **Acepto**: nombres explícitos `establecimiento_cue_key` y `establecimiento_localidad_nombre_uniq`, `throws_ok` con el mensaje en el pgTAP, y que un 23505 desconocido muestre el error general.
6. **Acepto todo** lo que aplica a la fase A:
   - CUE vacío → `null` en zod;
   - los criterios 3 y 4 también valen al editar;
   - "ningún rol de la API" en lugar de "nadie";
   - la clave `['establecimientos', 'detalle', id]`;
   - al guardar, volver a la localidad guardada.

   La fila sin CUE pasa a la fase B.
7. Sin cambios.

# Crítica del código

Crítico de diseño, 2026-10-10, sobre la fase A ya implementada: la migración `20261010170000_padron.sql`, `padron.test.sql`,
`src/features/establecimientos/**`, `src/pages/admin/establecimientos/**`, el router, el sidebar y `docs/arquitectura.md`.

## Veredicto
Está bien así. El corte sigue el molde de `categoria` y `normativas` sin agregar capas. Toma lo que ya está en `shared/`
(`idDeRuta`, `normalizar`, `Buscador`, `NoEncontrado`, `ConfirmDialog`), y la Respuesta de la crítica de la spec quedó aplicada
completa: nombres de constraint como contrato, fijados con `throws_ok`; CUE vacío → `null`; clave de detalle bajo `['establecimientos']`;
vuelta a la localidad guardada; escalera de carga con `isPending`. No encontré una alternativa claramente más simple.

## Puntos
Sin hallazgos. Miré estas alternativas y las descarto, para no reabrirlas en la próxima ronda:

1. **Un helper compartido para leer `code` de un error.** Sería un `codigoDe(error)` en `shared/lib`. La guarda
   `typeof error === 'object' && ... code === X` ya aparece en `talleres/errores.ts`, `normativas/errores.ts` y acá. Pero cada copia
   es una línea, y la de este corte además lee `message`. Un helper ahorra poco y agrega un import más a módulos que hoy son puros
   y no importan nada. Conviene recién si aparece una cuarta copia que lea más de un campo.
2. **Validar `?localidad=` contra la lista en un solo lugar.** Hoy lo hacen `EstablecimientosPage` y `EstablecimientoFormPage`
   (`localidades.some(...)`), con la misma regla y en una línea cada uno. Sacarlo a una función no simplifica nada. El único efecto
   del listado: mientras cargan las localidades, un id inexistente dispara una consulta que vuelve vacía. No hace daño.
3. **Ordenar las localidades por `id` en lugar de `nombre`.** Los ids ya siguen el orden alfabético de `localidades.md`.
   **Verificado:** con la collation de la base (`en_US.UTF-8`), `order by nombre` da exactamente 1..79. Con `C` cambiaría
   (`Caá Yarí`, `Dos de Mayo`, `Mártires`). Como hoy da lo mismo, no lo propongo. Si la nube usara otra collation, `.order('id')`
   lo resuelve en una línea.

El `CHECK (cue ~ '^[0-9]{1,20}$')` repite el largo de `varchar(20)`: el tipo corta antes (lo explica `notas.md`). Es redundante pero
no cuesta nada, y queda como documentación.

## Respuesta (código)

Sin hallazgos que aplicar. Coincido con los tres descartes:
- un `codigoDe` compartido conviene recién si aparece una cuarta copia;
- validar `?localidad=` en un solo lugar no simplifica, porque son dos líneas;
- el orden por `nombre` es el que quiere la UI, más allá de cómo queden los ids.

El CHECK redundante con el largo del `varchar` queda como documentación.
