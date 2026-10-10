---
name: scripts-de-carga
description: Trampas de los scripts Node de carga de datos (spec padron, 2026-10-10), .ts con Node 24 fuera de tsconfig, normalización JS vs unaccent, flags de confirmación que un agente puede pasar, 23505 por nombre de constraint
metadata:
  type: project
---

En la crítica de la spec `padron` (2026-10-10, primer script de carga con service_role), verifiqué lo siguiente:
- **Node 24.21 ejecuta `.ts`:** un import relativo con extensión `.ts` funciona, y también `import type` desde `database.ts`. `@/` y los
  imports sin extensión dan `ERR_MODULE_NOT_FOUND`. Desde un `.ts` se puede importar un `.mjs`. **`scripts/` no está en ningún tsconfig**
  (app incluye `src`, node incluye `vite.config.ts` y `src/test/hooks`), así que `typecheck` en verde no dice nada de los scripts. Propuse
  agregarlo a `tsconfig.node.json` (nodenext).
- **Normalización en JS frente al índice:** `btrim` no quita U+00A0 y `String.trim()` sí. `unaccent` convierte ß/Œ y `normalizar` no.
  Un plan en JS que predice los 23505 puede equivocarse. Propuse limpiar el nombre antes de guardarlo (`\s+` → espacio, `trim`) y
  tomar el 23505 al escribir como rechazo de esa fila, sin abortar todo.
- **Flags de confirmación** (`--confirmar`): un agente también los puede pasar, y `proteger-bash` solo mira `supabase`/`npm run db:*`.
  Propuse `--confirmar=<host>` y sumar el script a la regex de `proteger-bash`.
- **PostgREST no expone `constraint_name`:** viene solo dentro de `message` (`... unique constraint "nombre"`). Si hay dos únicos en una
  tabla, conviene nombrarlos explícitamente y fijarlos con `throws_ok(..., '23505', '<mensaje exacto>')`.
- Hay un patrón de alcance que se repite: specs que construyen el parser de un formato externo todavía sin muestra (C-08). Propuse dejarlo
  para una fase B, cuando llegue el archivo real.

En la crítica del código de la fase B (2026-10-10) apareció lo siguiente:
- **Codificación del CSV:** `readFileSync(f, 'utf8')` no falla: cambia los bytes inválidos por U+FFFD (verificado). Excel en español
  exporta "CSV (delimitado por comas)" en Windows-1252 y con `;`, y los nombres con `N°` pasan la validación rotos. La solución
  verificada es `new TextDecoder('utf-8', { fatal: true })`, que además saca el BOM.
- **Paginación con `range`:** cortar cuando `data.length < PAGINA` depende del `max_rows` del servidor (local 1000; en la nube se
  configura en el dashboard). Conviene cortar cuando llega una página vacía.
- **Guardia local copiada:** `supabase status` + `esUrlLocal` + `SERVICE_ROLE_KEY ?? SECRET_KEY` quedaron repetidos en
  `seed-usuarios.mjs` y en `importar-padron.ts`. Ver si el próximo script (logo) suma una tercera copia.

**Why:** los scripts quedan fuera de las redes que ya tiene el frontend (tsc, hooks de Bash, RLS, porque usan service_role), y sus
fallas aparecen recién cuando el usuario los corre contra la nube.

**How to apply:** en cada spec con script de `scripts/` (seed, importación, logo), revisar el tsconfig, los imports, la guardia de la nube
en `proteger-bash` y la normalización duplicada. Ver la `## Respuesta` de `docs/specs/padron/critica.md`. Relacionado:
[[hooks-bash-regex-cruda]], [[postgres-rpc-triggers-trampas]].
