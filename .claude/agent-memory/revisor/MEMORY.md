# Memoria del revisor

Errores que se repiten en el proyecto. La mantiene el subagente; se revisa en los PRs.

- [Privilegios y tests en migraciones Supabase](supabase-privilegios-y-tests.md) — default privileges, EXECUTE de fns de trigger, WHEN que salta auditoría, asserts vacuos; no ensuciar la base
- [supabase-js en el frontend](supabase-js-frontend.md) — errores lanzados vs {error}, error de carga sin mostrar, verificación manual pendiente (x8), isLoading, ruta de caché, Number(null)=0, idDeRuta fuera de int4
- [Scripts de carga por CSV](scripts-carga-csv.md) — comilla sin cerrar, cp1252 como UTF-8, `obj[clave]` con prototipo, resumen planificado
- [Evasión de hooks por regex](hooks-denylist-evasion.md) — comillas, `\`+salto, flags intercalados, $(), pipes a bash; y "node" en tsconfig.app
