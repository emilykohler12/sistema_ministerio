---
name: hooks-frontmatter-no-invocados
description: Los hooks limitar-* del frontmatter no corrían; desde 0021 los permisos por rol los aplica roles.mjs (settings.json, agent_type). Sondear en vivo y buscar escrituras/ejecución con comandos de la lista blanca
metadata:
  type: project
---

En la revisión de agente-qa (2026-10-10, Claude Code 2.1.294) se comprobó que los hooks `limitar-escritura` y `limitar-bash`
declarados en el frontmatter de los subagentes **no se ejecutaban** (requieren confianza de la carpeta; SDK y `-p` no cuentan).
Se arregló en hooks-subagentes (ADR 0021): `roles.mjs` en `settings.json` lee `agent_type` y aplica `perfiles.mjs`. Ahora sí bloquea
al revisor (comprobado: `node --version` → "(rol revisor)"). Consecuencia: el revisor no puede usar `node`, `for`, `sed`, ni escribir al
scratchpad; para sondear usa comandos de la lista blanca.

Al activarse, las listas blancas mostraron agujeros (2026-10-10, sondeados en vivo): `find "-exec"` (las comillas se vuelven `Q`),
`GIT_EXTERNAL_DIFF=` delante de `git diff --ext-diff` (se borra el prefijo de variables), `rg --pre`, `sort -o`, `git diff --output=`,
`uniq in out`, `tree -o`, `git branch -D`, y `"--fix"` entre comillas para oxlint.

**Why:** una lista blanca de "comandos de lectura" igual deja escribir o ejecutar si no se miran las banderas, y las comillas esconden
banderas a los lookahead.
**How to apply:** ante cambios en `perfiles.mjs`/`roles.mjs`/agentes, sondeá en vivo (comando fuera de lista, Write fuera del perfil) y
probá banderas que escriben (`-o`, `--output`) o ejecutan (`--pre`, `-exec`, `GIT_*`, `NODE_OPTIONS`) en los comandos permitidos, con y
sin comillas. Verificá que falle cerrado (import dentro del try, exit 2). Ver [[hooks-denylist-evasion]].
