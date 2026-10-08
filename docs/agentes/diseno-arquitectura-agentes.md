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
| **Explore** | Subagente (reemplaza al incluido) | Sonnet | Busca contexto en el repo: código, specs, decisiones | Solo lectura (hook `limitar-bash lectura`) |
| **test-writer** | Subagente | Sonnet | Escribe tests que fallan a partir de la spec (fase RED) | Solo `*.test.ts(x)`; shell solo para checks (hooks) |
| **implementador** | Subagente | Sonnet | Implementa la spec o el plan con TDD. Si duda, se detiene y devuelve `BLOQUEADO` | Edición + MCP Supabase |
| **crítico** | Subagente | Opus | ¿Hay una forma más simple o mejor? Revisa la propuesta y la estructura del código | Lectura; escribe solo `critica.md` y su memoria (hooks) |
| **revisor** | Subagente | Opus | ¿Está bien hecho? Revisa requisitos, tests, seguridad y RLS | Lectura + checks; escribe solo `revision.md` y su memoria (hooks) |

**Crítico ≠ revisor.** El crítico cuestiona el *diseño*. El revisor verifica la *corrección*. Separados para no mezclar "esto tiene un bug" con "yo lo haría distinto".

### Reglas del crítico

- Simplicidad como norte. No suma dependencias salvo que eliminen más código del que agregan.
- Máximo 3 puntos, priorizados, cada uno con una alternativa concreta.
- Puede (y debe) decir "está bien así" cuando no hay algo claramente mejor.
- Lee `docs/decisiones/` y no reabre decisiones sin un argumento nuevo.
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
           ├──► crítico (código) ┐
           └──► revisor          ┘ en paralelo → critica.md / revision.md
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
| **Chico** | Un endpoint, un componente, un bug acotado | Plan breve en `docs/specs/<tarea>/plan.md` → implementador (test primero) → revisor |
| **Feature** | Panel de talleres, sistema de descargas | Flujo completo con spec y crítico |

---

## 4. Dónde vive cada cosa

| Pieza | Se carga | Uso en el DAM |
|---|---|---|
| **CLAUDE.md** (<200 líneas) | Siempre | Dominio resumido, stack, comandos, estructura, reglas clave |
| **Output style** | Siempre, solo en la sesión principal | Personalidad y forma de trabajar del ingeniero |
| **Reglas** (`.claude/rules/`) | Al tocar archivos que coinciden | `react.md` (`src/**/*.tsx`), `migraciones.md` (`supabase/**`) |
| **Skills** (`.claude/skills/`) | Al invocarlas o cuando aplican | Procedimientos y flujos |
| **Subagentes** (`.claude/agents/`) | Al delegar | Los 5 roles de arriba |
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
| `limitar-escritura.mjs <perfil>` | Antes de editar (frontmatter del agente) | Cada subagente solo escribe lo de su rol: tests, `critica.md` o `revision.md` |
| `limitar-bash.mjs <perfil>` | Antes de cada comando (frontmatter del agente) | Lista blanca de comandos: `lectura` (Explore, crítico) o `checks` (test-writer, revisor) |

Límite honesto: los hooks frenan errores y atajos, no a un agente malicioso. Por ejemplo, un test
puede escribir archivos al ejecutarse. Para eso está la revisión humana del PR.

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
├── agents/                   Explore · test-writer · implementador · critico · revisor
├── skills/                   spec · tdd · supabase-rls · criticar · decision · pr · verify
├── rules/                    react.md · migraciones.md
├── hooks/                    formatear · proteger · proteger-bash · checks-stop · contexto · limitar-*
└── agent-memory/             critico/ · revisor/  (memoria compartida por git)
docs/
├── arquitectura.md           mapa del sistema
├── decisiones/               decisiones tomadas
└── specs/<feature>/          spec · contexto · critica · revision · notas
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
