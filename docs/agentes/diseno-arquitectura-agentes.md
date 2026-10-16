# Arquitectura de agentes — Diseño

Proyecto DAM · Ministerio de Educación de Misiones
Herramienta: Claude Code · Todo vive dentro del repositorio y se comparte por git.

---

## 1. Principios

1. **Simple primero.** Se agrega complejidad solo si mejora resultados de forma demostrable.
2. **Un agente principal fuerte, pocos subagentes con rol claro.** En programación hay poco trabajo paralelizable y los agentes coordinan mal entre ellos.
3. **Orquestación plana.** Solo el agente principal delega. Ningún subagente lanza otros (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`).
4. **Verificar, no confiar.** Todo trabajo termina con evidencia: tests, checks, capturas.
5. **Quien hace no se califica a sí mismo.** La crítica y la revisión las hacen agentes con contexto limpio.
6. **El trabajo pasa por archivos, no por mensajes.** Cada fase deja un `.md` en la carpeta de la feature.
7. **Lo obligatorio va en hooks y permisos**, no en instrucciones.

---

## 2. Roles

| Rol | Tipo | Modelo | Responsabilidad | Herramientas |
|---|---|---|---|---|
| **Ingeniero en Sistemas** | Sesión principal (output style) | Opus | Discute, planifica, enseña, orquesta, decide el carril | Todas |
| **Explore** | Subagente (reemplaza al incluido) | Sonnet | Busca contexto en el repo: código, specs, decisiones | Solo lectura (hook `roles.mjs`, perfil `lectura`) |
| **test-writer** | Subagente | Sonnet | Escribe tests que fallan a partir de la spec (fase RED) | Solo `*.test.ts(x)`; shell solo para checks (hooks) |
| **implementador** | Subagente | Sonnet | Implementa la spec o el plan con TDD. Si duda, se detiene y devuelve `BLOQUEADO` | Edición + MCP Supabase |
| **crítico** | Subagente | Opus | ¿Hay una forma más simple o mejor? Revisa la propuesta y la estructura del código | Lectura; escribe solo `critica.md` y su memoria (hooks) |
| **revisor** | Subagente | Opus | ¿Está bien hecho? Revisa requisitos, tests, seguridad y RLS | Lectura + checks; escribe solo `revision.md` y su memoria (hooks) |
| **qa** | Subagente | Sonnet | ¿Funciona en la app real? Escribe pocos e2e (Playwright), los corre contra el Supabase local y reporta | Lectura + checks + `test:e2e`; escribe solo `e2e/`, `qa.md` y su memoria (hooks). No toca `src/` |

**Crítico ≠ revisor.** El crítico cuestiona el *diseño*. El revisor verifica la *corrección*. Separados para no mezclar "esto tiene un bug" con "yo lo haría distinto".

**Revisor ≠ qa.** El revisor lee el código contra la spec. El qa usa la app en un navegador. Los e2e se escriben *después* de implementar (antes son frágiles: los selectores y textos aún no existen) y por un rol propio, para que la verificación en el navegador tenga dueño. Decisión 0020.

### Reglas del qa

- Pocos tests por feature: el camino feliz y 2 o 3 errores clave de la spec. Lo demás ya lo cubren Vitest y pgTAP.
- Solo contra el Supabase local; `npm run db:reset` si necesita base limpia y siempre al terminar (pgTAP asume tablas vacías). Nunca la nube.
- Corre después del crítico y el revisor, nunca en paralelo: comparten la base local con el `test:db` del revisor.
- No modifica el código de la app: reporta bugs con pasos para reproducir en `docs/specs/<feature>/qa.md`.
- Todo lo que está mal en lo que ve un usuario es bug (al menos menor), aunque la spec no lo pida; las observaciones son huecos de cobertura, sugerencias y dudas (0023).
- En el carril chico corre solo si el cambio toca Storage, permisos de anon (RLS o RPC) o rutas; si solo toca una pantalla, el ingeniero corre `npm run test:e2e` como regresión (0023).

### Reglas del crítico

- Simplicidad como norte. No suma dependencias salvo que eliminen más código del que agregan.
- Máximo 3 puntos, priorizados, cada uno con una alternativa concreta.
- Puede (y debe) decir "está bien así" cuando no hay algo claramente mejor.
- Lee el índice `docs/decisiones/README.md`, abre solo los ADR relevantes y no reabre decisiones sin un argumento nuevo.
- Una sola ronda por fase. Los desacuerdos los decide una persona.

---

## 3. Flujo

```
VOS ◄──► INGENIERO
           │ 1. Elige carril y, si es feature, escribe la spec con vos
           ├──► Explore ............. contexto.md
           ├──► crítico (diseño) .... critica.md → ingeniero responde
           │ 2. Spec aprobada
           ├──► test-writer ......... tests en rojo
           ├──► implementador ....... código en verde
           │        └─ BLOQUEADO → ingeniero → vos → se retoma
           ├──► crítico (código) ┐ en paralelo → critica.md / revision.md
           ├──► revisor          ┘
           └──► qa (navegador) ...... después, solo si hay pantalla: e2e en e2e/ → qa.md; db:reset al terminar
                    │
             Stop hook + CI ──── checks deterministas
                    │
                    PR → revisión humana del compañero
```

### Carriles: el esfuerzo escala con la tarea

| Carril | Ejemplos | Flujo |
|---|---|---|
| **Directo** | Typo, texto, estilo, una línea | El ingeniero lo hace y corre los checks |
| **Consulta** | Preguntas, análisis, revisar configuración | El ingeniero responde sin modificar archivos |
| **Chico** | Un endpoint, un componente, un bug acotado | Plan breve en `docs/specs/<tarea>/plan.md` → implementador (test primero) → revisor → `qa` si toca Storage, permisos de anon o rutas; si solo toca una pantalla, `test:e2e` como regresión |
| **Feature** | Panel de talleres, sistema de descargas | Flujo completo con spec y crítico |

---

## 4. Dónde vive cada cosa

| Pieza | Se carga | Uso en el DAM |
|---|---|---|
| **CLAUDE.md** (<200 líneas) | Siempre | Dominio resumido, stack, comandos, estructura, reglas clave |
| **Output style** | Siempre, solo en la sesión principal | Personalidad y forma de trabajar del ingeniero |
| **Reglas** (`.claude/rules/`) | Al tocar archivos que coinciden | `react.md` (`src/**/*.tsx`), `migraciones.md` (`supabase/**`) |
| **Skills** (`.claude/skills/`) | Al invocarlas o cuando aplican | Procedimientos y flujos |
| **Subagentes** (`.claude/agents/`) | Al delegar | Los 6 roles de arriba |
| **Hooks** | En eventos, siempre | Lo que no puede fallar |
| **docs/** | A demanda | Conocimiento compartido del equipo |

### Skills

| Skill | Tipo | Quién la usa |
|---|---|---|
| `/spec <feature>` | Tarea | Ingeniero: entrevista y escribe la spec desde una plantilla |
| `/criticar <ruta>` | Tarea (corre en el crítico) | Cualquiera, a demanda |
| `/decision <tema>` | Tarea | Registra una decisión en `docs/decisiones/` |
| `/pr` | Tarea (solo manual) | Commit + PR con el diff real |
| `verify` | Tarea | Receta para levantar y verificar el DAM (se genera con `/run-skill-generator`; pendiente) |
| `tdd` | Conocimiento | Precargada en test-writer e implementador |
| `supabase-rls` | Conocimiento | Precargada en implementador y revisor |

### Hooks

| Hook | Evento | Qué garantiza |
|---|---|---|
| `formatear.mjs` | Después de editar | `oxlint --fix` en el archivo editado |
| `proteger.mjs` | Antes de editar | Nadie toca `.env*`, `package-lock.json` ni migraciones ya commiteadas |
| `proteger-bash.mjs` | Antes de cada comando | Lo mismo que `proteger.mjs`, pero por shell (`cat .env`, `sed -i`, `>`) |
| `checks-stop.mjs` | Al terminar un turno | Si hubo cambios: lint + typecheck + tests deben pasar. Sin `node_modules` avisa que falta el Dev Container |
| `contexto.mjs` | Después de compactar | Reinyecta la rama y la spec activa (deducida de la rama `feat/<x>`) |
| `roles.mjs` | Antes de editar y de cada comando (`settings.json`) | Lee `agent_type` y aplica el perfil del rol (reglas en `perfiles.mjs`). Escritura: cada subagente solo escribe lo de su rol (tests, `critica.md`, `revision.md` o, qa, `e2e/` y `qa.md`; Explore nada). Bash: lista blanca `lectura` (Explore, crítico), `checks` (test-writer, revisor) o `qa` (checks + `test:e2e` sin banderas de configuración). El principal y los roles de `LIBRES` (implementador, `general-purpose`, `claude`, `Plan`, `claude-code-guide`, `statusline-setup`) no se restringen; un rol desconocido no escribe. Falla cerrada (exit 2) |

Los tres hooks de PreToolUse (`proteger`, `proteger-bash` y `roles`) llevan `"onFailure": "block"` en `settings.json`: si el script no arranca,
sale con un código distinto de 0 y 2, vence el timeout o emite salida inválida, la llamada se bloquea como con un exit 2 (falla cerrada incluso ante
un crash). Requiere Claude Code ≥ 2.1.295: con una versión anterior hay que actualizar antes de usar el repo (el Dev Container instala la última al
reconstruirse). Los hooks de PostToolUse, Stop y SessionStart no lo llevan: no son barreras. Lo verifica `src/test/hooks/settings.test.ts`.
Consecuencia: un error de sintaxis en `lib.mjs`, `proteger*.mjs` o `roles.mjs` bloquea también al agente principal; lo arregla la persona desde una
terminal (`git checkout -- .claude/hooks/`). Los hooks son los de la rama activa al iniciar la sesión: una sesión iniciada en una rama sin `roles.mjs` no restringe a sus subagentes.

Los permisos por rol viven en `settings.json` y no en el frontmatter de `.claude/agents/*.md` (decisión 0021): los hooks del
frontmatter solo corren con la confianza de la carpeta aceptada, y una sesión del Agent SDK o de `claude -p` no cuenta.
`limitar-escritura.mjs` y `limitar-bash.mjs` quedan como CLI de un perfil, para probar las reglas a mano.

Límite honesto: los hooks frenan errores y atajos, no a un agente malicioso. Por ejemplo, un test
puede escribir archivos al ejecutarse. Para eso está la revisión humana del PR. Límites aceptados del perfil `checks`: `vitest run -u` (actualiza
snapshots) y `--reporter=blob` (escribe `.vitest-reports/`) no se bloquean; quedan dentro del repo y se ven en el diff.

Scripts en Node para que funcionen igual en Linux y Windows.

### Permisos y seguridad

- `deny`: lectura y edición de `.env*`, `git push --force`, reset de la base remota.
- `allow`: lint, typecheck, tests, `git status/diff/log`.
- El MCP de Supabase se declara **solo dentro del implementador**, apuntando a desarrollo, con `read_only` y `project_ref`.
- Desarrollo y tests corren contra **Supabase local**. Nunca contra producción.
- **Hoy Supabase no está integrado:** la skill `supabase-rls`, la regla `migraciones.md` y el MCP quedan listos para cuando se integre.

---

## 5. Estructura del repositorio

```
CLAUDE.md                     compartido
CLAUDE.local.md               personal (gitignored)
.claude/
├── settings.json             compartido: output style, permisos, hooks
├── settings.local.json       personal (gitignored): claves, preferencias
├── output-styles/ingeniero-sistemas.md
├── agents/                   Explore · test-writer · implementador · critico · revisor · qa
├── skills/                   spec · tdd · supabase-rls · criticar · decision · pr · verify
├── rules/                    react.md · migraciones.md
├── hooks/                    formatear · proteger · proteger-bash · checks-stop · contexto · roles · perfiles · limitar-*
└── agent-memory/             critico/ · revisor/ · qa/  (memoria compartida por git)
docs/
├── arquitectura.md           mapa del sistema
├── decisiones/               decisiones tomadas
└── specs/<feature>/          spec · contexto · critica · revision · qa · notas
e2e/                          pruebas de Playwright (las escribe y mantiene qa)
```

---

## 6. Memoria del equipo

- La memoria automática de Claude es **local de cada máquina**: no se comparte.
- Lo compartido vive en: `CLAUDE.md`, `docs/decisiones/`, `docs/specs/` y `.claude/agent-memory/`.
- Regla del error repetido: si un agente se equivoca dos veces en lo mismo, se corrige su prompt, skill o regla en un PR.

---

## 7. Fuera de alcance por ahora

- Varios implementadores en paralelo con worktrees.
- Agent teams y sesiones en segundo plano.
- Se evaluarán cuando el flujo básico funcione bien para los dos.
