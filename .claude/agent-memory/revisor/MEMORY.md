# Memoria del revisor

Errores que se repiten en el proyecto. La mantiene el subagente; se revisa en los PRs.

- [Privilegios y tests en migraciones Supabase](supabase-privilegios-y-tests.md) — default privileges, EXECUTE de fns de trigger, WHEN que salta auditoría, asserts vacuos; no ensuciar la base
- [supabase-js en el frontend](supabase-js-frontend.md) — errores lanzados vs {error}, error de carga sin mostrar, verificación manual pendiente (x9), isLoading, ruta de caché, Number(null)=0, idDeRuta fuera de int4, invalidar en onError desmonta el error, fix en el query builder sin consultas.test
- [Formularios RHF y a11y](formularios-rhf-a11y.md) — setError sin aria-describedby, error de par que se limpia a medias, probar RHF en scratchpad
- [Scripts de carga por CSV](scripts-carga-csv.md) — comilla sin cerrar, cp1252 como UTF-8, `obj[clave]` con prototipo, resumen planificado
- [Permisos por rol de subagentes](hooks-frontmatter-no-invocados.md) — roles.mjs (0021) solo restringe si la sesión arrancó con él (sin psql, sed -n ni supabase status para el revisor); banderas que escriben (tsc --generate*, -o, --output)
- [Evasión de hooks por regex](hooks-denylist-evasion.md) — comillas, `\`+salto, flags intercalados, $(), pipes a bash; y "node" en tsconfig.app
