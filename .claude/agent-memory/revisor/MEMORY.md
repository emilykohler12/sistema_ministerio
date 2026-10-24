# Memoria del revisor

Errores que se repiten en el proyecto. La mantiene el subagente; se revisa en los PRs.

- [Privilegios y tests en migraciones Supabase](supabase-privilegios-y-tests.md) — default privileges, service_role con EXECUTE (x4), firma con returns table, WHEN que salta auditoría, asserts vacuos (es_admin primero, desempates, orden = orden de uuid x2), firma sin pg_get_function_result x2, admin vs mismo sub sin marca, CONTRATO viejo; no ensuciar la base
- [supabase-js en el frontend](supabase-js-frontend.md) — trampas repetidas ya en rules/react.md y rules/datos.md (verificar y citar); técnicas de revisión, idDeRuta fuera de int4, fix en el query builder sin consultas.test, datos de la librería contra falsos positivos
- [Formularios RHF y a11y](formularios-rhf-a11y.md) — setError sin aria-describedby, error de par a medias, role="status" montado con su texto (x2), ids fijos de Dialog y Escape con dos diálogos, pila de focus trap (foco al cerrar el de abajo, test vacuo), test de carga vacuo, URL larga, "https://" pelado
- [Temporizadores de sesión](temporizadores-sesion.md) — actividad/extender tras el límite sin tic reinicia en vez de vencer; signOut no borra con token vencido sin red; `{error}` con token vigente sí borró (no recargar)
- [Scripts de carga por CSV](scripts-carga-csv.md) — comilla sin cerrar, cp1252 como UTF-8, `obj[clave]` con prototipo, resumen planificado
- [Permisos por rol de subagentes](hooks-frontmatter-no-invocados.md) — roles.mjs (0021) solo restringe si la sesión arrancó con él (sin psql, sed -n, supabase status ni Write al scratchpad para el revisor); banderas que escriben (tsc --generate*, -o, --output)
- [Evasión de hooks por regex](hooks-denylist-evasion.md) — comillas, `\`+salto, flags intercalados, $(), pipes a bash; y "node" en tsconfig.app
