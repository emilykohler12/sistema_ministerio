# Revisión — padrón fase B (script de carga)

Spec: `fase-b.md` (criterios 1-8). Decisión: 0019. Diff: working tree contra `9cc0e48` (más los archivos sin trackear).

## Veredicto
Cambios necesarios (dos importantes y ningún bloqueante). Los criterios 1 a 8 están implementados y los probé contra la base local.
Lo que falta es endurecer la lectura del CSV, porque hoy se pierden filas sin aviso o se guardan nombres corruptos.

## Cumplimiento por criterio
| # | Estado | Evidencia |
|---|---|---|
| 1 | OK | Al simular `ejemplo.csv` informa 6 altas y 7 rechazos con fila y motivo. Después, `establecimiento` y `registro_operacion` siguen en 0. Sin test automatizado del orquestador: la verificación es manual |
| 2 | OK | `--aplicar` escribe 6 altas. La segunda corrida da `Altas (0)`, `Cambios (0)` y `Escritas: 0`. Test puro en `planificar.test.ts` (idempotencia) |
| 3 | OK | Con un CSV propio: el CUE 5800005, inactivo, se renombró y siguió con `activo = f`. La fila sin CUE y los ausentes no cambiaron. Tests en `planificar.test.ts` |
| 4 | OK | Hay un test por cada motivo, en `planificar.test.ts` y `ejemplo.csv`. "Ya existe" contra una fila sin CUE: probado contra la base |
| 5 | OK | `Escuela Ø` contra `Escuela O` y `Escuela AE` contra `Escuela Æ` pasan el plan y chocan en el índice: dos rechazos `23505`, la carga sigue (1 alta y 2 cambios escritos) y sale con 1. Sin test automatizado |
| 6 | OK | Tests con U+00A0 real (lo verifiqué con `cat -A`) y espacios internos. La localidad se busca normalizada y después en `equivalencias` |
| 7 | OK | `entorno.test.ts` cubre la URL local, la remota sin clave, sin `--confirmar`, `--confirmar` vacío y un host distinto, prefijo o sufijo. `resolverDestino` corre antes de las lecturas. En el contenedor no hay variables `SUPABASE_*` |
| 8 | OK (literal) | `padron.test.ts`: 11 formas bloqueadas y 4 locales permitidas. Se evade con comillas o escapes (ver menor 1) |

## Problemas

### Importantes
- **[importante]** `scripts/padron/csv.ts:48-73`: una comilla sin cerrar se traga el resto del archivo **sin aviso**. Basta un nombre exportado sin
  comillas, como `9100001,Escuela "Gral San Martin,Posadas` seguido de dos filas válidas: el informe dice `CSV: 1 filas` y un único rechazo
  ("localidad desconocida (vacía)"). Las filas 3 y 4 no figuran ni como altas ni como rechazos, y eso rompe el criterio 1 (informar cada fila). También
  pasa que una `"` en medio de una celda sin comillas abre el modo comillas y la comilla desaparece del nombre.
  **Arreglo:** si `entreComillas` sigue en `true` al terminar, lanzar un error con la fila donde se abrió la comilla. Tratar la `"` como literal cuando
  no está al principio de la celda. Agregar un test por cada caso en `csv.test.ts`.
- **[importante]** `scripts/importar-padron.ts:70`: el archivo se lee siempre como UTF-8. Un CSV de Excel en Windows en español (ANSI/cp1252, con
  `;`, el formato que el parser se preocupa por detectar) convierte `°`, `ñ` y las tildes en U+FFFD. Esos nombres **se proponen como altas y se
  escribirían corruptos**. Probado: `Escuela N° 7 Peña` (cp1252) se informa como alta `Escuela N� 7 Pe�a · Posadas`. Las localidades con tilde
  caen como "desconocida", pero las que no tienen (Posadas, Eldorado) pasan.
  **Arreglo:** decodificar con `new TextDecoder('utf-8', { fatal: true })` y abortar con un mensaje claro ("guardá el CSV como UTF-8"), o rechazar
  cualquier texto que contenga `�`. Agregar un test.

### Menores
1. `.claude/hooks/proteger-bash.mjs:36`: la regla compara cadenas sobre el comando crudo, así que la evaden `--confir""mar=…`, `--confir\mar=…`,
   `export SUPABASE_U""RL=…`, `padron:import""ar`, `node scripts/importar-padr*.ts` y `$(cat args.txt)`: todas pasan (las probé con un script en el
   scratchpad). El criterio 8 se cumple al pie de la letra, y la barrera real es que el agente no tiene la clave de servicio remota. Si se quiere
   cerrar mejor: quitar las comillas y las `\` antes de comparar, y bloquear también `$(`, los globs y `xargs` cuando aparece `padron`/`importar`.
   Agregar un test por cada forma. Es un patrón que ya apareció en `supabase-base`.
2. `scripts/padron/planificar.ts:69`: `equivalencias[k]` busca en un objeto literal con prototipo. Una localidad `constructor` (o `toString`,
   `valueOf`...) devuelve una función y `clave()` revienta: `importar-padron: texto.replace is not a function` y el script entero sale con 1, antes de
   escribir. **Arreglo:** `Object.hasOwn(equivalencias, k)` o un `Map`, más un test.
3. `scripts/importar-padron.ts:124-127`: con `--aplicar`, el "Resumen" muestra las altas y los cambios **planificados**, no los escritos. Probado:
   `Escritas: 1 altas y 2 cambios` seguido de `Resumen: 3 altas, 2 cambios, 4 rechazos`. Para quien corra la carga en la nube, conviene que el resumen
   use los contadores escritos, o que lo aclare.
4. `scripts/importar-padron.ts:63`: `traerTodo` corta cuando una página trae menos de 1000 filas. Si el proyecto de la nube tiene `max_rows` menor
   (en el local es 1000), lee solo la primera página sin avisar. Los CUE de las páginas siguientes se planifican como altas y terminan como rechazos
   `23505`, en lugar de cambios. No corrompe nada, pero el informe sale mal. Se arregla siguiendo hasta recibir una página vacía o comparando con
   `count: 'exact'`.
5. `planificar.ts:53` contra el índice `establecimiento_localidad_nombre_uniq`: `normalizar` (NFD + `\p{Diacritic}`) no es igual a `unaccent`.
   `Ø`, `Æ` y `ß` son distintos para el script e iguales para la base, y lo contrario pasa con `^`, `´`, `¨` y `·`. Además, el script junta los espacios
   internos y el índice no. Las dos direcciones terminan en un rechazo, en el plan o por 23505, así que no hay pérdida. Lo dejo anotado como límite
   en `notas.md`.
6. `notas.md`: falta el paso 4 de la verificación de la spec ("las altas aparecen en `/admin/establecimientos`"). Es la octava vez que la
   verificación en el navegador no queda registrada.
7. Los criterios 1 y 5 (no escribir sin `--aplicar`, el `23505` que sigue y el código de salida) solo tienen verificación manual. La spec no pedía test
   del orquestador, pero conviene anotar en `notas.md` cómo se verificó el camino del `23505` (por ejemplo, con el par `Ø`/`O`).

### Sin hallazgos
- service_role: la clave local sale de `supabase status`, no se imprime ni se persiste, y se exige que `API_URL` sea local (`esUrlLocal` compara el
  hostname exacto). El script no lee `.env*`. La auditoría registra `INSERT` con `usuario_id IS NULL` (6 de 6).
- `seed-usuarios.mjs` importa `esUrlLocal` desde `.ts`: `db:reset` creó los dos usuarios.
- `tsconfig.node.json` solo suma `scripts/**/*.ts`, y `tsconfig.app.json` no cambió. Vitest toma `scripts/**/*.test.ts` con el include por defecto.
- Alcance: no se cambiaron migraciones ni el frontend. `spec.md` y los ADR no cambiaron.

## Evidencia
- `npm run lint`: exit 0. Las 4 advertencias que ya había (`AuthContext`, `TallerFormPage`, `ConfiguracionPage`, `DescargaModal`), ninguna en `scripts/`.
- `npm run typecheck` (`tsc -b`): exit 0, sin salida.
- `npm test`: 50 archivos y 660 tests, todos pasan. Del corte: `npx vitest run scripts src/test/hooks/padron.test.ts` da 4 archivos y 88 tests, todos pasan.
- `npm run test:db`: 16 archivos y 449 tests, `Result: PASS` (después del `db:reset` final).
- `npm run db:reset` + `padron:importar -- scripts/padron/ejemplo.csv`: 6 altas, 0 cambios, 7 rechazos (filas 8 a 14), exit 1. La base queda en 0.
- `--aplicar` dos veces: `Escritas: 6 altas y 0 cambios` y después `Altas (0) / Cambios (0) / Escritas: 0 altas y 0 cambios`.
- CSV de cambios y choques (scratchpad) con `--aplicar`: 1 alta, 2 cambios, 2 rechazos del plan y 2 por `23505`, exit 1. El inactivo sigue inactivo.
- Al terminar se corrió `npm run db:reset`: `establecimiento` = 0.
