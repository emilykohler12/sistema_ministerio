---
name: hooks-bash-regex-cruda
description: En proteger-bash.mjs los bloqueos por segmentos (analizarComando quita comillas) dejan pasar bash -c/env sh -c/sudo; preferir una regex anclada sobre el comando crudo
metadata:
  type: project
---

En Fase A de `supabase-base` (2026-10-08), el bloqueo de Supabase remoto se armó sobre `analizarComando`. Esa función
reemplaza el contenido entre comillas por `Q`, así que el implementador agregó un caso `anidado` con una lista de
lanzadores (`sh`/`bash`/`eval` al inicio del segmento). Resultado: `bash -c 'npx supabase link'`, `env sh -c`, `sudo`,
`timeout` y `npx -c` pasaban todos. Recomendé una regex sobre el comando crudo: "supabase, o `npm run db:*`, seguido en
el mismo comando simple de una marca remota". Es el mismo patrón que ya usaba el chequeo de `.env`.

**Why:** separar en segmentos sirve para detectar *escrituras* (`>` dentro de un string no es sintaxis). Para detectar
*invocaciones prohibidas* hace lo contrario de lo que se necesita, porque esconde lo que va entre comillas.

**How to apply:** si un hook nuevo de Bash usa `segmentos` para buscar un comando prohibido, sugerir una regex cruda con
`[^;&|\n]*?` entre el programa y el flag. Antes de criticar, probar los casos anidados en el scratchpad, por ejemplo
`printf '{"tool_input":{"command":...}}' | node .claude/hooks/x.mjs`. Además, los deny de `settings.json` ganan sobre
las excepciones de los hooks (ejemplo: el deny `Edit(./.env.*)` tapa la excepción de `.env.example` en `proteger.mjs`).
Relacionado: [[permisos-agentes-vs-spec]].
