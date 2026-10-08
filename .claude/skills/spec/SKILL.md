---
name: spec
description: Entrevista al usuario y escribe la spec de una feature en docs/specs/<feature>/spec.md. Usar al empezar cualquier feature del carril "feature".
argument-hint: [nombre-feature]
---

Escribí la spec de la feature "$ARGUMENTS".

1. Leé el índice `docs/decisiones/README.md` (y solo los ADR relevantes), la sección pertinente de
   `docs/definicion-dam.md`, `docs/arquitectura.md` y specs relacionadas.
2. Pedile al subagente `Explore` el contexto del código involucrado.
3. Entrevistá al usuario con AskUserQuestion: casos borde, quién puede hacer qué, datos,
   estados vacíos y de error, UI, qué queda fuera de alcance. Nada obvio: buscá lo difícil.
   Cuando haya opciones, incluí tu recomendación primero.
4. Completá [plantilla.md](plantilla.md) en `docs/specs/$ARGUMENTS/spec.md`
   y guardá el contexto de Explore en `docs/specs/$ARGUMENTS/contexto.md`.
5. Máximo una página. Si no entra, la feature es demasiado grande: proponé dividirla.
6. Al terminar, ofrecé pasarla por el `critico` antes de aprobarla.
