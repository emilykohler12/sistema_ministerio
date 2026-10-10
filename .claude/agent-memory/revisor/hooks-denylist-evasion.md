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

**Why:** el criterio de la spec pedía "cualquier forma de invocación" y las listas negras por regex quedan cortas.
**How to apply:** ante cualquier hook de bloqueo nuevo o modificado, probá mentalmente estas formas y pedí un test
por cada una. También revisá si la lista negra cubre los caminos que usan un default remoto (en el CLI de Supabase:
`db dump/pull`, `migration list/repair`, `--project-ref`). Ante cambios en `tsconfig.app.json`, verificá que no
sumen tipos de Node.
