# Memoria del revisor

Errores que se repiten en el proyecto. La mantiene el subagente; se revisa en los PRs.

- [Privilegios y tests en migraciones Supabase](supabase-privilegios-y-tests.md) — default privileges de public, secuencias/EXECUTE, auditar() falla cerrada, URL local por prefijo
- [supabase-js en el frontend](supabase-js-frontend.md) — errores lanzados vs {error}, async sin catch, verificación manual sin anotar, docs de estado; falsos positivos
- [Evasión de hooks por regex](hooks-denylist-evasion.md) — comillas, `\`+salto, flags intercalados, $(), pipes a bash; y "node" en tsconfig.app
