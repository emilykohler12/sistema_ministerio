---
name: hooks-denylist-evasion
description: Los hooks de bloqueo por regex (proteger-bash) se evaden con comillas, continuación de línea, flags intercalados, $(...) y pipes a bash; revisar siempre esos casos
metadata:
  type: project
---

Los hooks de `.claude/hooks/` que bloquean por regex sobre `analizarComando` (que reemplaza lo entrecomillado por `Q`
y parte en `\n`) se pueden saltear con: argumentos entre comillas (`npx supabase "link"`), `\` + salto de línea,
flags entre subcomandos (`db --debug push`, Cobra lo acepta), `$(echo link)`, `| xargs` y `| bash` sin `-c`.
Lo encontré en la Fase A de supabase-base (2026-10-08). Los tests del implementador solo cubrían la forma directa.

Otra cosa que se repitió: para tipar un test de Node dentro de `src/` se agregó `"node"` a los `types` de
`tsconfig.app.json`, lo que contamina el tipado del código de navegador.

Se repitió en padrón fase B (2026-10-10): la regla nueva de `padron:importar` compara sobre el comando **crudo** y deja pasar
`--confir""mar=`, `--confir\mar=`, `export SUPABASE_U""RL=`, `padron:import""ar`, globs (`importar-padr*.ts`) y `$(cat args)`. Esta vez el
criterio era literal, así que lo marqué como menor: la barrera real es que el agente no tiene la clave remota.

Se repitió en agente-qa (2026-10-10). En la lista negra de banderas de Playwright pasan `"--config=x"`, `'--reporter=...'`,
`PW_TEST_REPORTER=` y `PLAYWRIGHT_HTML_OUTPUT_DIR=`, porque `limitar-bash` borra el prefijo de variables, y también `NODE_OPTIONS=--require`.
Lo de fondo: si un agente puede escribir archivos que después se ejecutan (`e2e/*.spec.ts`), la lista de banderas no contiene nada.

**Why:** el criterio de la spec pedía "cualquier forma de invocación" y las listas negras por regex quedan cortas.
**How to apply:** ante cualquier hook de bloqueo nuevo o modificado, probá mentalmente estas formas y pedí un test
por cada una. También revisá si la lista negra cubre los caminos que usan un default remoto (en el CLI de Supabase:
`db dump/pull`, `migration list/repair`, `--project-ref`). Ante cambios en `tsconfig.app.json`, verificá que no
sumen tipos de Node.
