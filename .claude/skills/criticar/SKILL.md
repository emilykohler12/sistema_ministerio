---
name: criticar
description: Pide al subagente crítico una opinión sobre una spec, un archivo, una carpeta o una idea.
argument-hint: [ruta o idea]
context: fork
agent: critico
disable-model-invocation: true
---

Criticá lo siguiente: $ARGUMENTS

Si es una ruta, leé el archivo o carpeta. Si es una idea en texto, evaluala contra el código actual
y los ADR relevantes según el índice `docs/decisiones/README.md`. Respondé con tu formato habitual (veredicto + máximo 3 puntos).
