---
name: decision
description: Registra una decisión de diseño en docs/decisiones/ con contexto, opciones y motivo.
argument-hint: [tema]
---

Registrá la decisión sobre "$ARGUMENTS".

1. Corré `git fetch origin main` y usá el siguiente al mayor número entre `docs/decisiones/` y
   `git ls-tree --name-only origin/main docs/decisiones/` (`000N-<tema-en-kebab>.md`). La otra persona puede haber
   mergeado un ADR mientras tanto; si al mergear tu rama el número ya existe, renumerá el tuyo (archivo, título y fila).
2. Si en la conversación no quedó claro qué se decidió y por qué, preguntalo antes de escribir.
3. Usá este formato, máximo 25 líneas:

```markdown
# 000N · <Título>

- **Estado:** aceptada
- **Fecha:** <AAAA-MM>

## Contexto
## Opciones consideradas
## Decisión
## Consecuencias
```

4. Si reemplaza una decisión anterior, marcá la vieja como `reemplazada por 000N`.
5. Agregá una fila a `docs/decisiones/README.md` (número, decisión en una línea, estado, "Leer si vas a tocar…").
   Si reemplazó a otra, actualizá también el estado de esa fila.
