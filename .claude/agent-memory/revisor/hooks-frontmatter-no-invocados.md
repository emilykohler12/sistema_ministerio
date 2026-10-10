---
name: hooks-frontmatter-no-invocados
description: Los hooks limitar-* del frontmatter de .claude/agents/*.md no se invocaban (2026-10-10); los de settings.json sí. Probar invocación en vivo, no solo el script
metadata:
  type: project
---

En la revisión de agente-qa (2026-10-10, Claude Code 2.1.294) se comprobó que los hooks `limitar-escritura` y `limitar-bash`
declarados en el frontmatter de los subagentes **no se ejecutan**. El revisor corrió `node -e` y escribió fuera de `revision.md` sin
bloqueo, y en ningún transcript aparece un bloqueo de `limitar-*`. `proteger-bash` (de `settings.json`) sí bloquea dentro del subagente.
Los scripts funcionan cuando se los prueba a mano con stdin. Esto explica que en el padrón el revisor escribiera `revision-fase-b.md` y
el crítico usara heredoc. Además, un script que no carga sale con 1, que no bloquea: falla abierta.

**Why:** `hooks.test.ts` solo prueba el script, no la invocación, así que todo el diseño de permisos por rol podía estar inactivo sin que
ningún test lo detectara.
**How to apply:** al revisar cualquier cambio en `.claude/agents/` o `.claude/hooks/limitar-*`, hacé una sonda en vivo: un comando fuera
de la lista blanca, como `node -e`, y un Write al scratchpad. Mirá si bloquea. Distinguí "el script funciona" de "el hook se invoca".
Si se arregló (con un despachador en `settings.json` por `agent_type`), verificá que falle cerrado. Ver también [[hooks-denylist-evasion]].
