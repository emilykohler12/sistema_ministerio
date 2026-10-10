# Revisión 1 — agente QA con Playwright (carril chico)

Diff revisado: cambios sin commitear sobre `360c60c` en `chore/agente-qa` (15 archivos modificados más `.claude/agents/qa.md`,
`docs/decisiones/0020-agente-qa-y-e2e.md`, `e2e/`, `playwright.config.ts`), contra `docs/specs/agente-qa/plan.md`.

## Veredicto
Cambios necesarios

Lo que agrega el diff está bien armado: la infraestructura de Playwright anda, los scripts de hook bloquean lo que dicen sus tests y la
documentación refleja el flujo. Pero la garantía central del plan ("el hook bloquea a `qa` si intenta escribir en `src/`") **no se cumple
en ejecución**: los hooks declarados en el frontmatter de `.claude/agents/*.md` no se están invocando para ningún subagente (el
problema ya existía antes de este cambio y explica lo que vio el coordinador en el corte padrón). Además, faltan los pasos 4 y 5 del plan.

## Problemas

### Bloqueante

- **[bloqueante]** `.claude/agents/qa.md:9-18` (y lo mismo en `revisor.md`, `critico.md`, `test-writer.md`, `explore.md`):
  los hooks `limitar-escritura` y `limitar-bash` del frontmatter **no se invocan**. El script funciona; el hook no se ejecuta.
  - *El script funciona* (probado a mano, con stdin):
    `limitar-escritura revisor src/x.ts` → exit 2; `revisor docs/specs/padron/revision-fase-b.md` → exit 2;
    `revisor .../revision.md` → 0; `qa src/x.ts` → 2; `qa e2e/../src/x.ts` → 2; `qa e2e/x.ts` → 0;
    `limitar-bash checks "node -e 1"` → 2. Incluso sin `CLAUDE_PROJECT_DIR` bloquea, porque `relPath` cae en `cwd`.
  - *El hook no se invoca* (probado en esta misma sesión, con `agentType: "revisor"`, según el `.meta.json` del subagente):
    `node -e "console.log(...)"` corrió, igual que un `for ...; do` y `awk` (ninguno está en la lista blanca de `checks`), y un Write
    al scratchpad (fuera de `revision.md`) se completó. En cambio, `echo "supabase link ..."` lo bloqueó `proteger-bash.mjs`: los hooks
    de `.claude/settings.json` **sí** corren dentro de los subagentes; los del frontmatter, no.
  - *Historial*: en todos los transcripts de `~/.claude/projects/-workspaces-sistema-ministerio/` hay 29 `PreToolUse:Bash hook error`, todos de
    `proteger-bash.mjs`, y **ninguno** de `limitar-bash` ni de `limitar-escritura`. Hubo un crítico (perfil `lectura`) que corrió
    `docker exec -i supabase_db_... psql <<'SQL'` y un test-writer (perfil `checks`, en primer plano) que corrió `mkdir -p`, y nada los frenó.
    Pasa tanto con agentes en segundo plano como en primer plano. El formato del frontmatter coincide con el de `settings.json`
    (`PreToolUse` → `matcher` → `hooks[] {type, command}`) y con lo documentado; Claude Code 2.1.294. No pude determinar si la causa es la
    versión, el modo en que el Agent tool lanza a los subagentes o un detalle del parseo del frontmatter.
  - *Un riesgo más*: si el script no carga (ruta mal armada, error de sintaxis), `node` sale con 1 y en Claude Code un PreToolUse con exit ≠ 2
    no bloquea. Probado: `node /.claude/hooks/limitar-bash.mjs` → exit 1.
  - *Propuesta*: (1) diagnosticarlo con un hook temporal en `settings.json` que vuelque el stdin a un archivo, para ver si la entrada de los
    subagentes trae `agent_type`/`agent_id`; (2) si lo trae, mover la aplicación a `settings.json` con un despachador único (`agent_type` →
    perfil) que falle cerrado ante un `agent_type` desconocido en los perfiles restringidos; si no lo trae, reportarlo y documentar en
    0002/0020 y en `diseno-arquitectura-agentes.md:116-117` que hoy la barrera es la revisión humana; (3) agregar al checklist de
    `guia-de-uso-agentes.md` una prueba en vivo (pedirle al revisor que escriba en `src/` y ver el bloqueo), porque `hooks.test.ts` solo prueba
    el script. Hasta que esto se resuelva, el criterio "El hook bloquea a `qa`" del plan no está cumplido.

### Importante

- **[importante]** `docs/specs/agente-qa/plan.md` pasos 4 y 5 / verificación "`npm run test:e2e` pasa con el padrón": no hay
  `e2e/padron.spec.ts`; solo está `e2e/smoke.spec.ts` (home y login). Las pantallas del padrón ya existen
  (`src/pages/admin/establecimientos/`). *Propuesta*: hacer el estreno del `qa` sobre el padrón antes de cerrar el plan, o sacar 4 y 5 del plan
  de forma explícita.

- **[importante]** `.claude/output-styles/ingeniero-sistemas.md:54` con `.claude/agents/qa.md:40`: en el paso 7, `revisor` y `qa` corren en
  paralelo y los dos pueden correr `npm run db:reset` (perfiles `checks` y `qa`), y el revisor además `npm run test:db`. Un `db:reset` del `qa`
  en medio del `test:db` del revisor (o al revés) rompe la corrida del otro con un error que no es de la feature. Los datos que dejan los e2e
  (ADR 0020:25) también pueden afectar a un pgTAP que cuente filas. *Propuesta*: que el coordinador corra `db:reset` una vez antes de lanzar el
  paso 7 y que, dentro de ese paso, el `qa` no lo corra (o que el revisor no corra `test:db` en paralelo con el `qa`). Dejarlo escrito en el
  output style y en `qa.md`.

- **[importante]** `.claude/hooks/limitar-bash.mjs:24` y ADR `0020:20-21`: la lista negra de banderas de Playwright no es la barrera, y se
  saltea. Probado contra el perfil `qa` (todos exit 0):
  `npm run test:e2e -- "--config=otra.ts"`, `npx playwright test '--reporter=./e2e/r.ts'`, `npx playwright test --reporter"=./e2e/r.ts"`
  (`analizarComando` reemplaza lo entrecomillado por `Q`), `PW_TEST_REPORTER=./e2e/r.ts npx playwright test` y
  `PLAYWRIGHT_HTML_OUTPUT_DIR=src npx playwright test` (`limitar-bash.mjs:44` borra las variables del principio antes de comparar). Y lo de
  fondo: el `qa` puede escribir `e2e/*.spec.ts`, que Playwright ejecuta como Node, con un `fs.writeFileSync('src/...')` o un
  `page.screenshot({ path })` con cualquier ruta. Es el "un test puede escribir archivos al ejecutarse" de
  `diseno-arquitectura-agentes.md:119`, pero 0020 presenta el hook de escritura y la lista de banderas como si fueran la contención.
  *Propuesta*: no seguir agregando banderas; decir en 0020 que la contención real es la revisión del diff (y el arreglo del bloqueante). Si
  se quiere algo determinista, que el `qa` termine su reporte con `git status --porcelain` y que el coordinador rechace cambios fuera de
  `e2e/` y `docs/specs/*/qa*`. Si se mantiene la lista, agregar tests para las formas con comillas y con variables de entorno.

### Menor

- **[menor]** `playwright.config.ts:16-20`: `webServer` no fija `VITE_SUPABASE_URL` ni `VITE_SUPABASE_PUBLISHABLE_KEY`, y
  `reuseExistingServer: true` reusa cualquier servidor que esté en el 5173. La garantía de "solo Supabase local" depende de lo que diga
  `.env.local` (no lo leí: está denegado). *Propuesta*: `webServer.env` con `VITE_SUPABASE_URL: 'http://127.0.0.1:54321'` (en Vite, las
  variables del proceso le ganan a `.env.local`), o un chequeo en `e2e/helpers.ts` que falle si la URL no es local.
- **[menor]** `limitar-bash.mjs:44` (ya existía): `NODE_OPTIONS=--require=./e2e/x.cjs npm test` pasa en `checks` y en `qa`, porque se borra el
  prefijo de variables. Es la misma familia de evasiones que la anterior.
- **[menor]** `.claude/hooks/limitar-bash.mjs:26`: `^npm run test:e2e\b` acepta `npm run test:e2e:<lo-que-sea>` (`\b` entre `e` y `:`). Hoy no
  hay un script con ese nombre. *Propuesta*: `(?=\s|$)` en lugar de `\b`.
- **[menor]** `docs/decisiones/README.md:9`: la fila de 0002 sigue diciendo "cinco subagentes" y no menciona 0020. *Propuesta*: agregar
  "(seis desde 0020)".
- **[menor]** Desvío del plan, justificado: el plan pide que `qa` pueda correr `dev`, pero el perfil lo bloquea (`hooks.test.ts`, caso
  `npm run dev`); `webServer` lo levanta solo. Conviene anotarlo en el plan.
- **[menor]** Coherencia del flujo: 0020:27 dice que el revisor ya no puede correr `test:e2e`, pero al revisor se le pidió correrlo. Si los
  hooks funcionaran, ese paso quedaría bloqueado. O el coordinador deja de pedírselo, o se suma `test:e2e` (sin argumentos) a `checks`.

### Verificado sin observaciones
- `limitar-escritura.mjs` perfil `qa`: anclado (`^e2e/`, `qa\.md$`), no deja pasar `e2e-otro/`, `qa.md.bak`, `..` ni la memoria de otro agente.
- Perfil `checks`: el lookahead `test(?!:db|:e2e)` excluye `test:e2e`, y `npx playwright` no entra en `checks`. `db:reset`/`test:db` siguen anclados.
- Vitest excluye `e2e/**` (`vite.config.ts`) sin perder los excludes por defecto. `e2e/` y `playwright.config.ts` van en `tsconfig.node.json`
  (tipos de Node), no en `tsconfig.app.json`.
- `.devcontainer/devcontainer.json`: imagen bookworm con `sudo`, `--with-deps` funciona como `node`; la versión del navegador sale del lockfile
  (`@playwright/test` 1.64.0). Chromium 1248 instalado en `~/.cache/ms-playwright`.
- `.gitignore` con `test-results/` y `playwright-report/`; la corrida no dejó archivos sin ignorar.
- `qa.md` es coherente con los otros agentes (frontmatter, `memory: project`, salida en `docs/specs/<feature>/qa.md`, `BLOQUEADO`) y con 0020.
  Output style, `diseno-arquitectura-agentes.md`, `guia-de-uso-agentes.md`, `arquitectura.md` y `CLAUDE.md` reflejan el flujo.
- `e2e/helpers.ts`: las credenciales son las del usuario sembrado solo en local (`seed-usuarios.mjs`), no un secreto.

## Evidencia

```
$ npm run lint        → exit 0; 0 errores, solo warnings que ya estaban (react incompatible-library, only-export-components)
$ npm run typecheck   → tsc -b, exit 0
$ npm test            → Test Files 50 passed (50) · Tests 720 passed (720)
$ npm run test:e2e    → Running 2 tests using 1 worker
                        ✓ e2e/smoke.spec.ts:4  la home carga (4.1s)
                        ✓ e2e/smoke.spec.ts:9  el administrador inicia sesión y llega al dashboard (2.1s)
                        2 passed (7.7s)

Sondas de invocación (subagente revisor, perfil checks):
$ node -e "console.log('node corrió: ...')"           → corrió (limitar-bash no se invocó)
Write al scratchpad (fuera de revision.md)            → "File created successfully" (limitar-escritura no se invocó)
$ echo "supabase link (sonda...)"                     → bloqueado por proteger-bash.mjs (settings.json sí se invoca)
```
