---
name: permisos-agentes-vs-spec
description: Las specs que tocan hooks/permisos de agentes suelen suponer perfiles que no existen; contrastar siempre con .claude/agents/*.md y limitar-*.mjs
metadata:
  type: project
---

En la spec `supabase-base` (2026-10-08) el diseño de permisos asumía cosas falsas: que el implementador
tenía `limitar-bash` (no lo tiene, solo hooks globales), y no notaba que `limitar-escritura tests` solo
acepta `*.test.ts(x)`, así que el test-writer no podía escribir pgTAP (`.sql`). Además los deny de
`settings.json` por prefijo (`npx supabase ...`) se esquivan con `npm exec`, `./node_modules/.bin` o
`npm run x -- --flag`, y faltaba `--db-url`.

**Why:** cada nueva herramienta (Supabase CLI, SQL) rompe el supuesto de que "tests = .test.ts" y
"comandos = npm test/lint".

**How to apply:** cuando una spec agregue comandos o tipos de archivo, chequear frontmatter de
`.claude/agents/*.md` y los perfiles de `limitar-bash.mjs`/`limitar-escritura.mjs`; recomendar regex
anclados y bloqueos en `proteger-bash.mjs` (ve cualquier invocación) antes que deny por prefijo.
Relacionado: [[tipos-v1-vs-firma-hooks]].
