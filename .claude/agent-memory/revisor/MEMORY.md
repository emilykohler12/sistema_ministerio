# Memoria del revisor

Errores que se repiten en el proyecto. La mantiene el subagente; se revisa en los PRs.

- [Privilegios y tests en migraciones Supabase](supabase-privilegios-y-tests.md) — default privileges, EXECUTE de fns de trigger, WHEN que salta auditoría, asserts vacuos; no ensuciar la base
- [supabase-js en el frontend](supabase-js-frontend.md) — errores lanzados vs {error}, error de carga sin mostrar, verificación manual pendiente (x9), isLoading, ruta de caché, Number(null)=0, idDeRuta fuera de int4
- [Formularios RHF y a11y](formularios-rhf-a11y.md) — setError sin aria-describedby, error de par que se limpia a medias, probar RHF en scratchpad
- [Scripts de carga por CSV](scripts-carga-csv.md) — comilla sin cerrar, cp1252 como UTF-8, `obj[clave]` con prototipo, resumen planificado
- [Permisos por rol de subagentes](hooks-frontmatter-no-invocados.md) — frontmatter no corría; ahora roles.mjs (0021). Sondear en vivo; listas blancas con -o/--output/--pre/-exec/GIT_*
- [Evasión de hooks por regex](hooks-denylist-evasion.md) — comillas, `\`+salto, flags intercalados, $(), pipes a bash; y "node" en tsconfig.app
