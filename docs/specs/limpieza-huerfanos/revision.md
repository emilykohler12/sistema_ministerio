# Revisión 1

Plan: `docs/specs/limpieza-huerfanos/plan.md` (#28, carril chico). Diff sin commitear de `feat/limpieza-huerfanos` contra `main`, más los archivos
nuevos `scripts/limpiar-storage.ts`, `scripts/storage/planificar.ts`, `scripts/storage/planificar.test.ts` y `src/test/hooks/storage.test.ts`.

## Veredicto
Cambios necesarios

## Problemas
- **[importante]** `scripts/limpiar-storage.ts:54-66` y `:93-96`: las rutas referenciadas se paginan por **offset** (`.order('id').range(d, h)`).
  Si mientras corre el script se borra una fila con `id` menor que el corte de la página (la baja de un recurso o de una normativa), las filas
  siguientes se corren un lugar y la primera de la página siguiente no se lee. Esa ruta falta en `referencias`, su objeto se clasifica como
  huérfano y, si tiene más de la edad mínima, `--aplicar` lo borra con la fila todavía viva. Se rompe el invariante de 0016 y la regla del plan:
  "los objetos con ruta referenciada nunca se borran". Pasa con más filas que una página: 1000, o el `max_rows` de la nube si es menor, que es justo
  el caso que esta paginación quiere cubrir. El listado de Storage también pagina por offset, pero ahí un salto deja un objeto sin listar, y un
  objeto sin listar no se borra: es seguro. El importador del padrón usa el mismo `traerTodo`, pero ahí saltear una fila no borra nada. **Arreglo:**
  paginar las referencias por clave (keyset): `.order('id').gt('id', ultimoId).limit(PAGINA)`, avanzar con el `id` de la última fila recibida y
  cortar con una página vacía. Un borrado en el medio ya no corre las demás filas.
- **[importante]** `scripts/limpiar-storage.ts:27-41`: `leerArgumentos` es la guardia de `--edad-minima` (el plan pide abortar con un valor inválido)
  y no tiene test. Leyendo el código, `x`, `-1`, `1.5`, el valor vacío (`--edad-minima=`) y `--edad-minima` sin `=` abortan antes de conectar,
  pero ningún test lo fija y un cambio a `parseInt`/`Number` lo rompería sin que se note. **Arreglo:** exportar `leerArgumentos`, o moverla a
  `scripts/storage/`, y testear los casos inválidos (lanza) y los válidos (`0`, `60`, sin la opción = 60, `--aplicar`), incluido que una
  opción desconocida o un argumento suelto lanzan.

## Verificado (sin problemas)
- **Falla cerrada antes de borrar.** Se listan los dos buckets y después se leen las dos tablas. Cualquier `error` lanza (`traerTodo:59`,
  `listarBucket:78`), y `main().catch` sale con 1 antes de `planificar`. No se borra nada con lecturas incompletas, salvo el caso de offset de
  arriba. El orden listar → leer base es correcto: una fila insertada entre las dos lecturas queda en las referencias.
- **max_rows menor que la página.** `traerTodo` y `listarBucket` cortan con una página vacía y avanzan por `data.length`, no por el tamaño pedido.
- **Comparación de rutas.** Igualdad exacta por `Set` y por bucket. La ruta del listado se arma como `prefijo/nombre`, recursiva por carpetas
  (`id === null`). Coincide con `rutaNueva` (`<taller_id>/<uuid>.<ext>` y `<uuid>.pdf`) y con los CHECK de la base (`recurso_ruta_del_taller`,
  regex de `normativa`). Los dos lados vienen de `crypto.randomUUID()` en minúsculas y no hay barras iniciales. Un objeto referenciado siempre
  cae en `conservados`, aunque sea joven o no tenga fecha (`planificar.ts:48`, con test). `recurso` se lee con service_role, sin RLS: entran las filas de
  todos los talleres, en cualquier estado.
- **Edad mínima.** Si `creado` es nulo o no se puede leer, el objeto va a `jovenes`, nunca a `huerfanos`. El reloj (`ahora`) se inyecta y
  `planificar` es puro. El borde exacto (igual a la edad mínima = huérfano) tiene test.
- **Borrado.** Va por lotes de 100. Un `error` o un `data.length` menor que el lote cortan todo lo que falta, también el otro bucket (la condición
  `!errorFatal` está en el bucle interno, y el de buckets entra en él igual), y la salida es 1. El resumen usa los borrados reales, no los planificados.
- **Destino.** Reutiliza `resolverDestino` y `supabaseLocal` sin cambiarlos. Una URL remota exige la clave de servicio y `--confirmar=<host>`
  exacto. `--confirmar <host>` con espacio aborta por "Sobra un argumento", así que también falla cerrado.
- **Hook.** La regla es la misma que la del padrón, sobre el comando crudo: cubre `npm run`, `node scripts/limpiar-storage.ts`, `env`,
  `export ... &&`, `bash -c` y `--confirmar` con o sin `=`, y no bloquea la corrida local (tests de los dos lados). Un `SUPABASE_URL` que venga del
  perfil del shell sin `--confirmar` lo frena `resolverDestino`. Las evasiones conocidas de esta clase de reglas (`--confir""mar`,
  `storage:limp""iar`, globs, `$(...)`) también pasan acá. Igual que en el padrón, quedan como límite aceptado: la barrera real es que el agente no
  tiene la clave remota.
- **Documentación.** El párrafo de Entorno, la brecha de Recursos y la consecuencia de 0016 describen el comportamiento real: simula por defecto,
  60 min, las filas sin archivo solo se informan, falla cerrada, `remove()` corto = error, mismo destino que el padrón. No se registró un ADR
  nuevo, y está bien. Ningún archivo fuera del alcance del plan cambió.
- **Tests.** `planificar.test.ts` cubre los seis casos del paso 1 y además el borde exacto, la edad 0, joven y referenciado, sin fecha y los buckets
  sin mezclar. Sin `planificar.ts` falla al importar. Los casos de bloqueo de `storage.test.ts` piden un stderr que nombre Storage, así que sin
  la regla nueva fallan. Vitest toma `scripts/` (9 archivos en la corrida de abajo) y `tsconfig.node.json` lo tipa.

## Observaciones (no bloquean)
- `--edad-minima=0` se acepta también contra la nube. Ahí un alta en curso (archivo subido y fila todavía sin insertar) puede quedar borrada, y
  la fila que se inserta después apunta a un archivo inexistente, justo lo que 0016 prohíbe. El plan no fija un mínimo. Si se quiere, se puede
  exigir un mínimo o confirmar aparte con un destino remoto. Queda a criterio de la persona.

## Evidencia
- `npx vitest run scripts src/test/hooks`: 9 archivos, 425 tests pasaron.
- `npm test`: 98 archivos, 1647 tests pasaron.
- `npm run lint`: sale con 0. Quedan 4 advertencias previas, todas en `src/` y ajenas al cambio (`incompatible-library` x3,
  `only-export-components` x1).
- `npm run typecheck` (`tsc -b`): sale con 0, sin errores.
- No pude correr la simulación contra el Supabase local: el perfil del revisor bloquea `npm run storage:limpiar` ("perfil checks"). No toqué la
  base, así que no hizo falta `db:reset`. La verificación contra Storage local del plan (huérfano viejo, joven y referenciado por bucket;
  simulación sin borrar, `--aplicar` borra solo el viejo y el referenciado sigue descargable) queda para el `qa`. Lo de arriba sale de
  leer el código.
