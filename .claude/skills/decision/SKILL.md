---
name: decision
description: Registra una decisión de diseño en docs/decisiones/ con contexto, opciones y motivo.
argument-hint: [tema]
---

Registrá la decisión sobre "$ARGUMENTS".

1. Mirá el último número en `docs/decisiones/` y usá el siguiente (`000N-<tema-en-kebab>.md`).
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
