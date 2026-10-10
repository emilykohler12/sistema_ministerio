# 0021 · Los permisos por rol de los subagentes viven en `settings.json`

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
Los límites de cada subagente (qué escribe, qué corre por shell) estaban como `hooks:` en el frontmatter de `.claude/agents/*.md`.
En la revisión de agente-qa se comprobó que nunca se ejecutaban: según la documentación, los hooks de agentes de proyecto requieren
la confianza de la carpeta, y una sesión del Agent SDK o de `claude -p` no cuenta. El rol quedaba como instrucción, no como barrera.

## Opciones consideradas
- **Frontmatter + correr los subagentes solo con la carpeta confiada:** depende de cómo se abra la sesión; falla en silencio.
- **Un despachador global en `settings.json` que lee `agent_type`:** `settings.json` se aplica siempre, como `proteger-bash`.

## Decisión
`.claude/hooks/roles.mjs` corre en PreToolUse (`Edit|Write|NotebookEdit|MultiEdit|Bash`), lee `agent_type` y aplica el perfil del rol
(reglas en `perfiles.mjs`): critico, revisor, test-writer, qa y Explore. El principal, el implementador y `general-purpose` no se
restringen (tampoco `claude`, `Plan`, `claude-code-guide` ni `statusline-setup`: lista `LIBRES`). Falla cerrada: error o entrada inválida → exit 2; un rol desconocido no escribe
y solo lee por bash. Se quitan los `hooks:` del frontmatter.
Verificado en vivo (2026-10-10, sesión nueva): `critico` pasa `ls`, y `node -e` y un Write fuera de `critica.md` se bloquean "(rol critico)".

## Consecuencias
- Agregar un rol con límites exige agregar su perfil en `perfiles.mjs` y su test; el frontmatter no alcanza.
- Los hooks se toman al iniciar la sesión: un cambio en `settings.json` se prueba en una sesión nueva.
- Si una versión de Claude Code deja de enviar `agent_type`, todos los subagentes quedarían sin restricción de rol (siguen `proteger*`).
- Con Claude Code ≥ 2.1.295 conviene `onFailure: "block"` para que un crash del script (exit 1) también bloquee.
