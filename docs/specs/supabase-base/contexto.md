# Contexto: supabase-base

Relevado por Explore el 2026-10-08. Solo hechos del repo.

## Dev Container
- `.devcontainer/devcontainer.json`: imagen `javascript-node:24-bookworm`, features claude-code y github-cli.
  Sin docker-in-docker, sin `privileged`, `forwardPorts: [5173]`. `devcontainer-lock.json` fija las features con sha.
- Volúmenes: `/home/node/.claude` y `node_modules`. `postCreateCommand`: chown + `npm ci`.

## Build, lint, git
- `package.json`: sin supabase-js ni CLI. vite ^8.3, vitest ^5.0.3, typescript ~6.0.2, oxlint ^1.81.
- `tsconfig.app.json`: `include: ["src"]`, `types: ["vite/client"]`. `supabase/` queda fuera de `tsc`; un `database.ts`
  dentro de `src/` sí entra (con `noUnusedLocals` y `erasableSyntaxOnly`).
- `vite.config.ts` contiene la config de vitest (sin `include`): descubre cualquier `*.test.ts`.
- `.oxlintrc.json` sin `ignorePatterns`: lintearía `database.ts` generado y las funciones Deno.
- `.gitignore`: `.env`, `*.local`. No cubre `.env.*`, `supabase/.temp`, `supabase/.branches`, `supabase/functions/.env`.
- No existe `import.meta.env` en `src/` ni `src/vite-env.d.ts`.

## Hooks y permisos de Claude Code
- `proteger.mjs` (Edit/Write): bloquea todo archivo que empiece con `.env` (incluye `.env.example`), `package-lock.json`
  y migraciones ya commiteadas. `proteger-bash.mjs` sí exceptúa `.env.example` (inconsistencia).
- `settings.json` deny: `npx supabase db reset --linked*`, `npx supabase db push*`. Sin `npx` o vía script npm no matchea.
- `formatear.mjs`: `oxlint --fix` sobre `.ts/.tsx/.js/.mjs`; no toca `.sql`.
- `limitar-bash.mjs`: el perfil de los subagentes no permite docker ni supabase.
- `.claude/rules/migraciones.md` (paths `supabase/**`): RLS en la misma migración, una política = un test.

## Dominio y docs
- `AuthContext.tsx`: sesión simulada con `sessionStorage['dam-responsable']`, sin contraseña.
- `supabase-rls/SKILL.md`: nota "pendiente"; no tiene el comando de tests ni menciona `es_admin()`.
- `definicion-dam.md` §8.3: `registro_operacion.usuario_id` NOT NULL. §8.4: no lista cuáles son las tablas "gestionables".
  Buckets sin nombre definido. Límite de 50 MB (0009).
