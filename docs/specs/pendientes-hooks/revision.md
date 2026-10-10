# Revisión 1

Alcance: cambios sin commitear de `chore/pendientes-hooks` contra `docs/specs/pendientes-hooks/plan.md` (pasos 1, 2 y 3).

## Veredicto
Cambios necesarios

Los tres pasos del plan están hechos y tienen test: `--outputFile` está bloqueado, los tres PreToolUse llevan `onFailure: "block"` y la fila de
`--body-file` está en la guía. Los checks pasan. Pido dos cambios chicos antes del PR: el punto 2 (el mismo agujero que el paso 1, pero en `tsc`)
y la aclaración del punto 1 en el ADR.

## Problemas

1. **[importante, previo a este cambio]** `docs/decisiones/0021-permisos-por-rol-en-settings.md:18`: en esta sesión `roles.mjs` no restringe a
   ningún subagente. Probé en vivo como `revisor`: el `agentType` es `"revisor"` en
   `subagents/agent-a8082d4b4990646bb.meta.json`, y aun así `node --version` corrió (v24.21.0) y un `Write` al scratchpad funcionó.
   `proteger-bash` sí corre: `echo supabase link` se bloqueó. Los transcripts de la misma sesión muestran lo mismo desde el principio, antes de
   tocar `settings.json`. El revisor anterior corrió `mkdir` y `sed -i`, y el qa corrió `python3` y `cat >> e2e/...`. A mano, el script bloquea
   bien (`{"agent_type":"revisor",...,"node --version"}` → exit 2). Lo más probable es que, en este tipo de sesión (Agent SDK, subagentes
   lanzados por el principal), la entrada del hook llegue sin `agent_type`, y entonces `roles.mjs:33` sale con 0. `onFailure: "block"` no lo
   cubre, porque no es un crash. Esto no viene de este cambio, pero el ADR dice "verificado en vivo" sin aclarar en qué tipo de sesión, y la
   consecuencia de la línea 23 ("si deja de enviar `agent_type`...") ya está pasando acá.
   **Arreglo:** acotar en el ADR la verificación al tipo de sesión donde se probó (`claude -p`). Abrir un pendiente: registrar en un archivo
   temporal el `agent_type` que recibe `roles.mjs` en una sesión como esta y decidir qué hacer si falta, por ejemplo usar el `agent_id` o
   bloquear cuando viene `agent_id` sin `agent_type`.

2. **[importante]** `.claude/hooks/perfiles.mjs:52`: el plan cierra `--outputFile` porque "hoy escribe un archivo donde quiera con el perfil
   `checks`". `tsc` deja hacer lo mismo y pasa el hook. Lo comprobé con `roles.mjs` y `agent_type: revisor`, todos exit 0:
   `npx tsc --noEmit --generateCpuProfile /tmp/x.cpuprofile`, `npx tsc --noEmit --generateTrace /tmp/dir` y
   `npm run typecheck -- --generateTrace /tmp/dir`. Además ejecuté `npx tsc --noEmit -p tsconfig.app.json --generateCpuProfile <scratchpad>/perfil.cpuprofile`:
   escribió 5,6 MB (ya borrados). Dentro del repo también escriben `npx oxlint --init` (`.oxlintrc.json`, que existe),
   `npx vitest run -u` (snapshots) y `--reporter=blob` (`.vitest-reports/`).
   **Arreglo:** sumar `generateCpuProfile|generateTrace|tsBuildInfoFile|init` a la alternancia de la línea 52 (o una entrada por comando para `tsc` y
   `oxlint`), con casos en `roles.test.ts`. Para `-u` y `blob`, como mínimo, dejarlo anotado como límite aceptado.

3. **[menor]** `docs/agentes/guia-de-uso-agentes.md:138`: con `onFailure: "block"`, un error de sintaxis en `lib.mjs` o en `proteger*.mjs` (lo
   importan de forma estática) bloquea **todo** Edit/Write/Bash del agente principal, también el que lo arreglaría. Antes, el exit 1 lo dejaba
   pasar. La fila dice "correr el script a mano", pero no dice que el agente no puede: lo tiene que arreglar la persona desde una terminal
   (`git checkout -- .claude/hooks/` o la edición a mano).
   **Arreglo:** decirlo en esa fila y en la consecuencia del ADR (línea 24).

4. **[menor]** `.claude/hooks/roles.mjs:6`: el comentario dice "un import estático que falla saldría con exit 1, que no bloquea". Ahora bloquea
   (si la versión es ≥ 2.1.295). El ADR ya lo presenta como "segunda defensa", y el comentario debería decir lo mismo.

5. **[menor]** `docs/decisiones/0021-permisos-por-rol-en-settings.md:7-8,17-18`: comparado con `HEAD`, la reescritura de Contexto y Decisión
   (el plan pedía solo Consecuencias) perdió tres detalles. Que la verificación fue en una "sesión nueva", que importa porque los hooks se
   toman al iniciar. Que el bloqueo muestra "(rol critico)". Y que un rol desconocido "solo lee **por bash**": "solo lee" a secas es ambiguo,
   porque Read/Grep/Glob no pasan por `roles.mjs`. El resto del contenido está.
   **Arreglo:** restituir esos tres detalles.

6. **[menor]** `docs/agentes/diseno-arquitectura-agentes.md:121` y ADR:24: dicen "Requiere Claude Code ≥ 2.1.295", pero no qué pasa con una
   versión anterior: si ignora el campo o si invalida el bloque `hooks`, lo que dejaría todo abierto. El feature del devcontainer instala la
   última versión al construir la imagen, pero un contenedor viejo no se actualiza solo.
   **Arreglo:** comprobarlo o anotar que con < 2.1.295 hay que actualizar antes de usar la rama.

Sin problemas en:
- Evasiones de `--outputFile`: no tiene forma corta en vitest (`cac.DfDGTQ9W.js:709`, sin `shorthand`). La `camelcase` de cac solo une
  `[a-z]-[a-z]`, así que las únicas formas que vitest acepta son `outputFile` y `output-file`, y las dos están cubiertas. También quedan bloqueadas
  `=`, `.json=`, las comillas (se borran), `$'..'` (expansión), `{F,}` (llaves) y `\`+salto de línea: el `--output` que queda se bloquea, y el
  resto del segmento cae como variable o fuera de la lista.
- Caminos de salida con `onFailure`: `proteger.mjs`, `proteger-bash.mjs` y `roles.mjs` solo salen con 0 o 2 en los caminos legítimos.
  `readInput` atrapa el JSON inválido, `run` atrapa el error de `git` y ninguno escribe en stdout. No encontré un exit 1 legítimo que ahora pase a
  bloquear.
- `settings.test.ts`: lee el archivo real y falla si se agrega un cuarto PreToolUse sin `onFailure` (por el `toHaveLength(3)`).

## Evidencia

```
$ npx vitest run src/test/hooks
 Test Files  4 passed (4)
      Tests  307 passed (307)

$ npm test
 Test Files  54 passed (54)
      Tests  936 passed (936)

$ npm run lint
exit 0 · 4 warnings, 0 errores (todos previos, en src/ de la app: AuthContext, ConfiguracionPage, TallerFormPage, DescargaModal)

$ npm run typecheck
> tsc -b
exit 0

Sondeo de roles.mjs (agent_type revisor, a mano):
2 :: npx vitest run --outputFile=/tmp/x.json
2 :: npx vitest run --outputFile.json=/tmp/x
2 :: npx vitest run --output-file /tmp/x
0 :: npx tsc --noEmit --generateCpuProfile /tmp/x.cpuprofile
0 :: npx tsc --noEmit --generateTrace /tmp/dir
0 :: npm run typecheck -- --generateTrace /tmp/dir
0 :: npx oxlint --init
0 :: npx vitest run -u
0 :: npx vitest run --reporter=blob

Sesión en vivo (subagente revisor, agentType "revisor"):
node --version        → v24.21.0 (roles.mjs no bloqueó)
Write al scratchpad   → creado (roles.mjs no bloqueó)
echo supabase link    → bloqueado por proteger-bash
```

## Respuesta (agente principal)

- 1: rechazo como bug, acepto la aclaración. La sesión que lanzó al revisor se inició en `feat/padron`, cuyo `settings.json` no registraba
  `roles.mjs`, y los hooks se toman al iniciar. Re-verificado en una sesión `claude -p` nueva (carpeta sin confiar): `critico` bloqueado en
  `node -e` "(rol critico)", así que `agent_type` llega. Los subagentes de esa sesión no escribieron fuera de su rol. ADR 0021 y memoria del revisor corregidos.
- 2: acepto. `--generateCpuProfile`, `--generateTrace`, `--tsBuildInfoFile` e `--init` bloqueados, con tests. `-u` y `--reporter=blob`, límite aceptado documentado.
- 3, 4, 5 y 6: acepto. Docs, comentario de `roles.mjs` y ADR ajustados.
