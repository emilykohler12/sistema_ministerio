# Plan: los permisos por rol de los subagentes se aplican de verdad (carril chico)

**Problema:** los hooks del frontmatter de `.claude/agents/*.md` no se ejecutan.
- Lo medimos: un hook de diagnóstico en `critico` nunca se invocó y `node -e` pasó.
- Causa, según la documentación (`hooks.md`, "Hooks in skills and agents", desde v2.1.218): los hooks de agentes de proyecto requieren
  haber aceptado la confianza de la carpeta, y una sesión del Agent SDK o de `-p` no cuenta. Así que el rol de cada subagente queda
  como instrucción, no como barrera.
- Agravante: un script de hook que falla sale con exit 1, y el exit 1 no bloquea. `onFailure: "block"` existe recién desde v2.1.295
  (tenemos v2.1.294).

**Solución:** un despachador en `settings.json`, que sí se aplica siempre, igual que `proteger-bash`.
- `.claude/hooks/roles.mjs`:
  - lee `agent_type` de la entrada del PreToolUse y aplica el perfil del rol:
    - `critico`: escritura `critico`, bash `lectura`;
    - `revisor`: escritura `revisor`, bash `checks`;
    - `test-writer`: escritura `tests`, bash `checks`;
    - `qa`: escritura `qa`, bash `qa`;
    - `Explore`: lectura, sin escritura.
  - Sin `agent_type` (agente principal) o con `implementador` / `general-purpose`: no restringe; quedan `proteger*`.
  - Falla cerrada: un error o una entrada inválida terminan en exit 2. Un `agent_type` desconocido también da exit 2 para Edit y Write.
  - Reutiliza la lógica de `limitar-escritura.mjs` y `limitar-bash.mjs`, que pasan a exportar funciones.
- `settings.json`: PreToolUse `Edit|Write|Bash` → `node .../roles.mjs`.
- Se quitan los `hooks:` del frontmatter de los agentes (código muerto que da una falsa sensación de seguridad). Cada agente queda con un comentario
  que remite a `roles.mjs`.
- Tests en `src/test/hooks/roles.test.ts`, con stdin simulado por rol: permitido y bloqueado, y exit 2 con un JSON roto.
- Verificación en vivo: lanzar `critico` y comprobar que `node -e 1` y un Write fuera de `critica.md` se bloquean.
- Documentación: `docs/agentes/` y el ADR 0021 (los permisos por rol viven en `settings.json`, porque el frontmatter depende de la confianza de la carpeta).

**Riesgo:** si `agent_type` no llega en esta versión, el despachador no puede distinguir roles. La prueba en vivo lo detecta antes del commit.
En ese caso, el plan B es correr los subagentes en una sesión con la carpeta confiada y documentarlo.

**Estado (2026-10-10):**
- Implementados `perfiles.mjs`, `roles.mjs` y el registro en `settings.json`. Los tests pasan: 140 de hooks.
- La prueba en vivo **no bloqueó** en la misma sesión. Lo más probable es que los hooks se tomen al iniciar la sesión: el
  `settings.local.json` de diagnóstico tampoco se disparó, ni siquiera para el agente principal.
- Todavía no se quitaron los `hooks:` del frontmatter ni se escribió el ADR 0021: esperan la verificación.

**Verificación en una sesión nueva** (recargar la ventana de VS Code o abrir otra sesión):
1. Lanzar `critico` y pedirle tres cosas: `ls docs/specs` (debe pasar), `node -e 1` (debe bloquearse) y un Write a `docs/specs/hooks-subagentes/prueba.md`
   (debe bloquearse con "(rol critico)").
2. Si bloquea: quitar los `hooks:` del frontmatter, escribir el ADR 0021 y actualizar `docs/agentes/`.
3. Si no bloquea: falta `agent_type`. Diagnosticar con un hook temporal que registre la entrada, con la aprobación del usuario, y pasar al plan B.

**Fuera de alcance:** actualizar Claude Code a la v2.1.295 o posterior (`onFailure`), aunque conviene hacerlo aparte.
