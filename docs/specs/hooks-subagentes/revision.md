# Revisión: hooks-subagentes (carril chico)

Alcance: commit `de3f8bc` (`perfiles.mjs`, `roles.mjs`, `limitar-*.mjs` como CLI, `settings.json` y `src/test/hooks/roles.test.ts`) y los
cambios sin commitear: frontmatter de `.claude/agents/*.md`, ADR 0021 y su fila, `docs/agentes/*.md` y el estado del plan.

## Veredicto
Cambios necesarios. No hay bloqueantes.

Los pasos del plan están implementados y probados, y la verificación en vivo pasó. Este revisor también corre bajo `roles.mjs`:
`node --version` se bloqueó con "(rol revisor)". El despachador falla cerrado ante un JSON roto, un `tool_input` con un tipo raro
(`path.isAbsolute` lanza y el `catch` sale con 2), un rol desconocido y claves del prototipo (`constructor` y `__proto__` dan un perfil
`undefined` y se bloquea todo).

El problema está en las listas blancas que ahora sí se aplican. Varios comandos permitidos escriben archivos o ejecutan comandos
arbitrarios. Los probé en vivo como revisor, con el perfil `checks`, que incluye a `lectura`, y escribiendo solo en el scratchpad.

## Problemas

- **[importante]** `.claude/hooks/perfiles.mjs:15-17` y `:55`: el perfil `lectura` (critico y Explore) y los perfiles que lo
  heredan permiten ejecutar comandos arbitrarios. Todo esto pasó el hook en esta sesión:
  - `find <dir> -maxdepth 0 "-exec" echo ejecutado-por-find {} +`: ejecutó. `analizarComando` cambia `"-exec"` por `Q`, así que
    el lookahead de `find` no lo ve. Lo mismo pasa con `-ex''ec`.
  - `GIT_EXTERNAL_DIFF="echo ejecutado-por-git" git diff --ext-diff main -- ...`: ejecutó. La línea 55 borra el prefijo de
    variables antes de comparar. Por el mismo camino pasan `NODE_OPTIONS=...` delante de `npm test` (checks y qa) y
    `PW_TEST_REPORTER=` (ya anotado en la revisión de agente-qa).
  - `rg --pre echo -l . <archivo>`: ejecutó `echo` por cada archivo.

  Arreglo:
  - Evaluar las banderas sobre una versión del segmento que **borre** las comillas en lugar de reemplazarlas por `Q`.
  - En los perfiles restringidos, rechazar las asignaciones de variables al inicio, salvo una lista cerrada (`CI=1`).
  - Prohibir `--pre`, `--pre-glob` y `--ext-diff` (o `-c`/`--config` de git).
  - Agregar un test por cada forma.

- **[importante]** `.claude/hooks/perfiles.mjs:15-16`: comandos de la lista `lectura` escriben archivos o cambian el repo sin usar `>`,
  así que `escribeArchivo` no los detecta.
  - Probados: `sort -o <scratchpad>/sort.txt package.json` creó el archivo, y `git diff --stat --output=<scratchpad>/diff.txt main`
    escribió 98 líneas.
  - Por lectura del código: `uniq in out`, `tree -o`, `git log/show --output=` y `git branch <nombre>` / `-D` / `-m` / `-f`, que
    crean, borran o mueven ramas.

  Son atajos verosímiles, no evasiones rebuscadas: el crítico ya escribió por heredoc en el padrón. Arreglo:
  - Rechazar `-o`, `--output` y `--output=` en `sort`, `tree` y `git`.
  - Sacar `uniq` o exigirle un solo argumento.
  - Limitar `git branch` a consultas (`--list`, `-a`, `-r`, `-v`, `--show-current`, sin otros argumentos).
  - Tests por cada caso.

- **[importante]** `.claude/hooks/perfiles.mjs:21` y `:24`: en `checks` y `qa`, `--fix` se evade con comillas. `npm run lint -- "--fix"`
  o `npx oxlint --fi''x` pasan, porque el lookahead `(?!.*--fix)` corre sobre el texto con `Q`. `oxlint --fix` modifica `src/`.
  No lo ejecuté porque modifica el repo: es por lectura del código. Arreglo: el mismo que el primer punto (evaluar sin comillas) y
  un test.

- **[menor]** `.claude/hooks/roles.mjs:25`: el `import()` de `perfiles.mjs` corre antes de leer `agent_type`. Si `perfiles.mjs` o
  `lib.mjs` se rompen, el agente principal también queda bloqueado en Edit, Write y Bash, y no puede arreglarlos. Eso contradice
  "sin agent_type → no restringe" del ADR y de `diseno-arquitectura-agentes.md`. Arreglo: parsear stdin y salir con 0 para el
  principal y los roles libres antes del import (un JSON roto sigue en exit 2).

- **[menor]** `.claude/hooks/perfiles.mjs:40` y `roles.mjs:36`: un path vacío o ausente se permite (`if (!file) return null`). Además
  `file_path ?? notebook_path` no cae a `notebook_path` cuando `file_path` es `""`. Hoy lo cubre la validación del esquema de Claude
  Code, pero no es falla cerrada. Arreglo: en `roles.mjs`, para las herramientas de escritura, exigir un string no vacío (usar `||`) y,
  si falta, bloquear.

- **[menor]** `src/test/hooks/roles.test.ts:58-61`: el test de NotebookEdit manda `file_path`, no `notebook_path`, así que la rama de
  `notebook_path` no tiene test. Tampoco se prueban:
  - MultiEdit;
  - `agent_type` con claves del prototipo (`constructor`);
  - stdin vacío y JSON `null`;
  - rutas absolutas fuera del proyecto o con `..` a través de `roles.mjs`;
  - ninguna de las evasiones de arriba.

- **[menor]** `.claude/hooks/perfiles.mjs:7`: el perfil `tests` no está anclado. `/\.test\.tsx?$/` y `/\/__snapshots__\//` aceptan
  rutas fuera del proyecto (`relPath` devuelve `../../...`). Es preexistente y de bajo impacto. Arreglo: rechazar los `file` que
  empiezan con `../` en `motivoEscritura`.

- **[menor]** `.claude/hooks/roles.mjs:20` frente al plan y los docs:
  - El plan dice que un `agent_type` desconocido bloquea Edit y Write. `LIBRES` además libera `claude`, `Plan`, `claude-code-guide`
    y `statusline-setup` (este último tiene Edit y Write).
  - El ADR lo menciona solo como "como Plan", y `docs/agentes/diseno-arquitectura-agentes.md:117` no lo menciona.
  - Arreglo: listar los libres en el ADR o en el doc, o sacar los que no hagan falta.

- **[menor]** `.claude/agent-memory/critico/project_permisos-agentes-vs-spec.md:18`: la memoria del crítico sigue indicando
  "chequear frontmatter de `.claude/agents/*.md` y los perfiles de `limitar-*.mjs`". Ahora el rol vive en `roles.mjs` y las reglas
  en `perfiles.mjs`. No la puedo editar: que la actualice el principal o el crítico. Las otras referencias vigentes están bien: los
  frontmatter remiten a `roles.mjs`, `docs/agentes` describe el despachador y las menciones en `docs/specs/*` y en ADR 0020 son
  históricas.

## Plan contra implementación

| Paso del plan | Estado |
|---|---|
| `roles.mjs` lee `agent_type` y aplica el perfil (critico, revisor, test-writer, qa, Explore) | OK, `ROLES` coincide con el plan |
| Principal, implementador y general-purpose sin restricción | OK (más libres que el plan, ver menor) |
| Falla cerrada (error o entrada inválida → 2; rol desconocido no escribe) | OK, con imports dinámicos dentro del `try` |
| `limitar-*.mjs` reutilizan la lógica | OK, son CLI finas sobre `perfiles.mjs`; `hooks.test.ts` los sigue cubriendo |
| `settings.json` PreToolUse → `roles.mjs` | OK (`Edit\|Write\|NotebookEdit\|MultiEdit\|Bash`) |
| Quitar `hooks:` del frontmatter, con un comentario | OK en los 5 agentes; el implementador nunca los tuvo |
| Tests de `roles.test.ts` (permitido, bloqueado, JSON roto) | OK, con las brechas listadas |
| Verificación en vivo | OK (declarada en el plan; confirmada también para el revisor en esta revisión) |
| ADR 0021 y `docs/agentes/` | OK; describen lo que hace el código, salvo la lista de libres |

## Evidencia

- `npm run lint`: rc 0. 0 errores, 4 warnings preexistentes en `src/` (`ConfiguracionPage`, `AuthContext`, `TallerFormPage`,
  `DescargaModal`), ninguno en archivos del cambio.
- `npm run typecheck` (`tsc -b`): rc 0, sin salida.
- `npm test`: 51 archivos, 755 tests, todos pasan. `npx vitest run src/test/hooks`: 3 archivos, 140 tests, todos pasan.
- Sondas en vivo bajo `roles.mjs` (rol revisor):
  - `node --version`: bloqueado;
  - `sort -o`: escribió;
  - `git diff --output=`: escribió;
  - `find ... "-exec" echo`: ejecutó;
  - `GIT_EXTERNAL_DIFF=... git diff --ext-diff`: ejecutó;
  - `rg --pre echo`: ejecutó.

## Respuesta (agente principal)

- H1–H7: acepto. Corregidos por el implementador con TDD en `perfiles.mjs` y `roles.mjs`: lista negra de banderas sobre el comando
  sin comillas, variables al inicio solo de una lista cerrada, `git branch` solo de consulta, `uniq` sin salida, import después de
  `agent_type`, ruta o comando inválido → bloqueo, rutas fuera del proyecto bloqueadas y `Object.hasOwn`. Tests de hooks: 140 → 292.
  Desvío aceptado: también se bloquean `$VAR`, `${…}` y `{a,b}` en los roles restringidos (permitían rearmar banderas).
- H8: acepto. La lista `LIBRES` completa queda en el ADR 0021 y en `docs/agentes/`.
- H9: acepto. Memoria del crítico actualizada.
- Pendiente: `--outputFile` de vitest no está en la lista negra (anterior a este cambio).
