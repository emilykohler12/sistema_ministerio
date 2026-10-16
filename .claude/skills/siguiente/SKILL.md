---
name: siguiente
description: Muestra el backlog (issues de GitHub), qué está tomando cada persona y recomienda la próxima tarea que no choque con el trabajo en curso. Usar cuando alguien pregunta qué hacer o antes de empezar una tarea nueva.
allowed-tools: Bash(gh issue list *) Bash(gh issue view *) Bash(gh issue edit *) Bash(gh pr list *) Bash(gh api user *)
---

## Estado actual
- Yo: !`gh api user --jq .login 2>&1`
- En curso (issues asignados): !`gh issue list --state open --limit 100 --json number,title,assignees,labels --jq '.[] | select(.assignees | length > 0) | "#\(.number) \(.title) — \([.assignees[].login] | join(", ")) — \([.labels[].name] | join(", "))"' 2>&1`
- Libres: !`gh issue list --state open --limit 100 --json number,title,assignees,labels --jq '.[] | select(.assignees | length == 0) | "#\(.number) \(.title) — \([.labels[].name] | join(", "))"' 2>&1`
- PR abiertos: !`gh pr list --state open --json number,title,author,headRefName --jq '.[] | "#\(.number) \(.title) (\(.headRefName), \(.author.login))"' 2>&1`

## Pasos
1. Si el estado muestra un error de autenticación, pedí correr `gh auth login` en la terminal del contenedor y detenete.
2. Resumí en una tabla corta qué está en curso y quién lo tiene (issues asignados y PR abiertos).
3. Recomendá **una** tarea libre y, como mucho, dos alternativas. Descartá:
   - las que tengan `esperando-ministerio` o `posterior`;
   - las que compartan una etiqueta `area:` con un issue en curso de la otra persona, o la nombren en "Choca con"
     (leé el cuerpo con `gh issue view <n>`).
   Si tiene `necesita-decision`, avisá que empieza por `/decision`.
4. Para la elegida, indicá el carril (por la etiqueta `carril:`) y la rama: `feat/<slug>` o `fix/<slug>`, **sin el número**.
   `<slug>` es también la carpeta de `docs/specs/` (el hook de contexto la busca por la rama).
5. Preguntá si la toma. Solo con un sí, asignala con `gh issue edit <n> --add-assignee @me` y mostrá la salida.
   La asignación es el aviso a la otra persona de que la tarea está tomada: va **antes** de crear la rama.
