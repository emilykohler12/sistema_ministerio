---
name: hooks-frontmatter-no-invocados
description: Los hooks limitar-* del frontmatter no corrían; desde 0021 roles.mjs (settings.json, agent_type) aplica los perfiles, solo si la sesión se inició con roles.mjs en settings.json. Sondear en vivo y buscar escrituras/ejecución con comandos de la lista blanca
metadata:
  type: project
---

En la revisión de agente-qa (2026-10-10, Claude Code 2.1.294) se comprobó que los hooks `limitar-escritura` y `limitar-bash`
declarados en el frontmatter de los subagentes **no se ejecutaban** (requieren confianza de la carpeta; SDK y `-p` no cuentan).
Se arregló en hooks-subagentes (ADR 0021): `roles.mjs` en `settings.json` lee `agent_type` y aplica `perfiles.mjs`. En una sesión
sí bloqueó al revisor (`node --version` → "(rol revisor)").

**Pero** en pendientes-hooks (2026-10-10, 2.1.296, sesión del Agent SDK con subagentes lanzados por el principal) `roles.mjs` NO restringió:
como revisor (meta.json `agentType: "revisor"`) corrí `node --version` y Write al scratchpad sin bloqueo, mientras `proteger-bash` sí
bloqueaba. Los transcripts de otros subagentes de esa sesión (revisor con `sed -i`, qa con `python3`) muestran lo mismo. **Causa real**
(verificada por el principal): esa sesión se había iniciado en `feat/padron`, cuyo `settings.json` no registraba `roles.mjs`, y los hooks
se toman al iniciar la sesión. En una sesión `claude -p` nueva (carpeta sin confiar), `critico` sí se bloqueó "(rol critico)": `agent_type` llega.

Al activarse, las listas blancas mostraron agujeros (2026-10-10, sondeados en vivo): `find "-exec"` (las comillas se vuelven `Q`),
`GIT_EXTERNAL_DIFF=` delante de `git diff --ext-diff` (se borra el prefijo de variables), `rg --pre`, `sort -o`, `git diff --output=`,
`uniq in out`, `tree -o`, `git branch -D`, y `"--fix"` entre comillas para oxlint. En pendientes-hooks: `tsc --generateCpuProfile/--generateTrace`
escriben donde quieran (también vía `npm run typecheck --`), `oxlint --init`, `vitest -u` y `--reporter=blob` escriben en el repo.

En descargas (2026-10-10) `roles.mjs` sí restringió al revisor (perfil checks): bloqueó `for`, `sed -n`, `cut` y `docker exec ... psql`. `npm run db:reset`,
`test:db`, `grep`, `git diff` y `cat` pasan. Sin psql, verificá privilegios leyendo la migración y los pgTAP (`aclexplode`, `has_function_privilege`), y leé
rangos de archivos con Read (offset/limit) en lugar de `sed -n`.

**Why:** una lista blanca de "comandos de lectura" igual deja escribir o ejecutar si no se miran las banderas, y las comillas esconden
banderas a los lookahead. Y un hook que "funciona a mano" puede no recibir los campos que espera en otro tipo de sesión.
**How to apply:** al empezar una revisión de hooks, sondeá primero si el rol se aplica a VOS (`node --version` debería bloquearse); si no,
reportalo y sugerí revisar con qué rama se inició la sesión antes de sospechar de `agent_type`. Ante cambios en `perfiles.mjs`/`roles.mjs`/agentes, probá banderas que escriben (`-o`, `--output`, `--generate*`, `--init`) o
ejecutan (`--pre`, `-exec`, `GIT_*`, `NODE_OPTIONS`) en todos los comandos permitidos (git, vitest, tsc, oxlint), con y sin comillas. Para
pasar comandos a roles.mjs a mano: `echo '{"agent_type":"revisor","tool_name":"Bash","tool_input":{"command":"..."}}' | node .claude/hooks/roles.mjs`.
Verificá que falle cerrado (import dentro del try, exit 2, `onFailure: "block"`). Ver [[hooks-denylist-evasion]].
