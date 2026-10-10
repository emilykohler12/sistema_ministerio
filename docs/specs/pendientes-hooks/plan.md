# Plan: pendientes de los hooks (carril chico)

**Objetivo:** cerrar lo que quedó abierto del ADR 0021. Rama `chore/pendientes-hooks`, en un PR aparte de la app (guía de agentes).

1. **`--outputFile` de vitest** (`.claude/hooks/perfiles.mjs`, `BANDERAS_PELIGROSAS`): bloquear `--outputFile` y `--outputFile.<x>`
   (también con `=` y con comillas). Hoy escribe un archivo donde quiera con el perfil `checks`. Test en `src/test/hooks/roles.test.ts`.
2. **`onFailure: "block"`** (solo si se actualiza Claude Code a 2.1.295 o posterior): sumarlo a los PreToolUse de `settings.json`
   (`proteger`, `proteger-bash` y `roles`), para que un crash (exit 1) también bloquee. Verificarlo en una sesión nueva con un script
   que lance a propósito. Actualizar el ADR 0021 (consecuencias) y `docs/agentes/`.
3. **Falso positivo de `proteger-bash`** con el texto de un PR: no se cambia (ver la respuesta al usuario). Se documenta que se usa
   `--body-file` en la guía de agentes.

**Verificación:** `npx vitest run src/test/hooks`, `npm test`, lint y typecheck. Revisor.

**Fuera de alcance:** C-08 y los municipios (esperan al Ministerio).

## Estado

Implementado en `chore/pendientes-hooks` (Claude Code 2.1.296):
- `--outputFile` (también `--outputFile=x`, `--outputFile.json=x`, `--output-file` y con comillas) bloqueado en `BANDERAS_PELIGROSAS`; tests en `src/test/hooks/roles.test.ts`.
- `"onFailure": "block"` en los tres PreToolUse de `.claude/settings.json`; test en `src/test/hooks/settings.test.ts`. Verificado en vivo (2026-10-10, Claude Code 2.1.296): dos sesiones `claude -p` aisladas
  (`--setting-sources ""` y `--settings` del scratchpad) con un PreToolUse de Bash que lanza un error. Con `"block"`: `failed; blocking because
  onFailure is "block"` y el `echo` no corrió. Con `"continue"` (control): el `echo` corrió.
- Docs: ADR 0021 (consecuencias), `docs/agentes/diseno-arquitectura-agentes.md` y `docs/agentes/guia-de-uso-agentes.md` (con la fila de `--body-file`).
- Revisión 1 atendida: `--generateCpuProfile`, `--generateTrace`, `--tsBuildInfoFile` e `--init` bloqueados (con tests); `-u` y `--reporter=blob` anotados como límite aceptado; docs y comentario de `roles.mjs` ajustados.
- Hallazgo 1 de la revisión (no es un bug): la sesión que lanzó al revisor se había iniciado en `feat/padron`, sin `roles.mjs` en `settings.json`,
  y los hooks se toman al iniciar. En una sesión `claude -p` nueva, `critico` se bloqueó en `node -e` "(rol critico)": `agent_type` llega.
  Los subagentes de esa sesión no escribieron fuera de su rol (revisado con `git status`). Queda anotado en el ADR 0021.
