---
name: pr
description: Crea el commit y el pull request de la rama actual con el diff real y la checklist del proyecto.
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git add *) Bash(git commit *)
---

## Estado actual
- Rama: !`git branch --show-current`
- Cambios: !`git status --short`
- Diff contra main: !`git diff --stat main...HEAD`

## Pasos
1. Si la rama es `main`, detenete y pedí crear una rama `feat/`, `fix/` o `chore/`.
2. Corré `npm run lint`, `npm run typecheck` y `npm test`. Si algo falla, no sigas.
3. Commit con Conventional Commits en español (`feat: ...`, `fix: ...`, `chore: ...`).
4. Antes de pushear, mostrale al usuario el resumen y pedí confirmación.
5. Push y PR con `gh pr create`. Cuerpo del PR:

```markdown
## Qué cambia
## Spec
docs/specs/<feature>/spec.md (si aplica)
## Cómo probarlo
## Checklist
- [ ] Lint, typecheck y tests pasan
- [ ] Revisado por el subagente revisor
- [ ] Docs/decisiones actualizadas si corresponde
```
