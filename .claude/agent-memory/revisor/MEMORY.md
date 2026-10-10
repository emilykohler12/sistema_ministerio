# Memoria del revisor

Errores que se repiten en el proyecto. La mantiene el subagente; se revisa en los PRs.

- [Privilegios y tests en migraciones Supabase](supabase-privilegios-y-tests.md) — default privileges, secuencias/EXECUTE, auditar() falla cerrada; RLS no restringe columnas
- [supabase-js en el frontend](supabase-js-frontend.md) — errores lanzados vs {error}, error de carga sin mostrar (también en pantallas vecinas), verificación manual sin anotar (x3)
- [Evasión de hooks por regex](hooks-denylist-evasion.md) — comillas, `\`+salto, flags intercalados, $(), pipes a bash; y "node" en tsconfig.app
