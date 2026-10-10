# 0021 · Los permisos por rol de los subagentes viven en `settings.json`

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
Los límites de cada subagente estaban como `hooks:` en el frontmatter de `.claude/agents/*.md`. En la revisión de agente-qa se comprobó
que nunca se ejecutaban: requieren la confianza de la carpeta, y una sesión del Agent SDK o de `claude -p` no cuenta. Eran instrucción, no barrera.

## Opciones consideradas
Frontmatter con la carpeta confiada (depende de cómo se abra la sesión; falla en silencio) o un despachador global en `settings.json` que lee `agent_type` (se aplica siempre, como `proteger-bash`).

## Decisión
`.claude/hooks/roles.mjs` corre en PreToolUse (`Edit|Write|NotebookEdit|MultiEdit|Bash`), lee `agent_type` y aplica el perfil del rol
(`perfiles.mjs`): critico, revisor, test-writer, qa y Explore. El principal y la lista `LIBRES` (implementador, `general-purpose`,
`claude`, `Plan`, `claude-code-guide`, `statusline-setup`) no se restringen. Falla cerrada: error o entrada inválida → exit 2; un rol
desconocido no escribe y solo lee por bash. Se quitan los `hooks:` del frontmatter. Verificado en vivo (2026-10-10, sesión nueva de
VS Code y de `claude -p` con la carpeta sin confiar): `critico` pasa `ls`; `node -e` y un Write fuera de `critica.md` se bloquean "(rol critico)".

## Consecuencias
- Agregar un rol con límites exige su perfil en `perfiles.mjs` y su test; el frontmatter no alcanza.
- Los hooks se toman al iniciar la sesión y son los de la rama activa en ese momento: un cambio en `settings.json` se prueba en una sesión nueva, y una sesión iniciada en una rama sin `roles.mjs` no restringe a sus subagentes.
- Si una versión de Claude Code deja de enviar `agent_type`, todos los subagentes quedarían sin restricción de rol (siguen `proteger*`).
- Los PreToolUse llevan `onFailure: "block"` (requiere Claude Code ≥ 2.1.295; con una versión anterior hay que actualizar antes de usar el repo): un crash, un timeout o una salida inválida equivalen a exit 2. El import dinámico dentro del `try` queda como segunda defensa.
- Un error de sintaxis en `lib.mjs`, `proteger*.mjs` o `roles.mjs` bloquea también al agente principal: lo arregla la persona desde una terminal (`git checkout -- .claude/hooks/`).
