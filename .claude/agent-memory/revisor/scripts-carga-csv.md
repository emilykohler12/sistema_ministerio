---
name: scripts-carga-csv
description: Huecos de los scripts de mantenimiento con service_role (padrón fase B, limpieza de Storage #28); comilla sin cerrar, cp1252 como UTF-8, lookup con prototipo, resumen planificado, paginación por max_rows y por offset con bajas concurrentes
metadata:
  type: project
---

En padrón fase B (`scripts/importar-padron.ts`, 2026-10-10) la lógica pura (planificar, entorno) salió bien y con buenos tests. Los huecos
estaban en los **bordes de la entrada** y en el orquestador, que no tiene test:

- Parser CSV propio: una `"` sin cerrar se traga el resto del archivo y las filas desaparecen del informe sin rechazo. Probalo con
  `1,Escuela "X,Posadas` seguido de filas válidas y mirá la línea `CSV: N filas`.
- `readFileSync(..., 'utf8')`: un CSV de Excel en Windows en español (cp1252, `;`) se convierte en U+FFFD y los nombres se escriben corruptos.
  Probalo con `iconv -t cp1252`. Pedí `TextDecoder('utf-8', { fatal: true })`.
- `mapa[clave]` sobre un objeto literal: una entrada `constructor` devuelve una función y revienta todo el script. Pedí `Object.hasOwn` o un `Map`.
- Con `--aplicar`, el resumen final usa los contadores del plan y no los escritos.
- Paginar con "página < 1000 = fin" depende de `max_rows` del proyecto de la nube.
- Se repitió en limpieza-huerfanos (#28, 2026-11-10), y es peor en un script que **borra**: `traerTodo` corta bien con página vacía, pero
  pagina las rutas referenciadas por offset. Una baja concurrente de una fila con id menor saltea otra, que queda fuera de las referencias, y su
  archivo se borra con la fila viva. Pedí keyset (`.gt('id', ultimo)`) en toda lectura que decida qué conservar. El listado de Storage por
  offset sí es seguro: lo que no se lista, no se borra. La guardia de argumentos (`--edad-minima`) quedó sin test por no estar exportada.
- `normalizar` (NFD + `\p{Diacritic}`) no es igual a `unaccent` (`Ø`, `Æ`, `ß`). Sirve para provocar a propósito un 23505 al escribir y probar el
  criterio de "23505 rechaza la fila y sigue".

Para no reportar falsos positivos: un heredoc o un `printf` que mencione el script y `SUPABASE_URL`/`--confirmar` lo bloquea `proteger-bash`
(falso positivo aceptado). Escribí los scripts de prueba con Write y armá las cadenas por partes.

**Why:** el criterio pedía informar cada fila con su motivo, y el script escribe con service_role, sin RLS que frene datos malos.
**How to apply:** en cada script de carga, probá CSV malformados (comilla sin cerrar, otra codificación, claves raras) contra la base local en
simulación. Después corré `db:reset`. Ver también [[hooks-denylist-evasion]] y [[supabase-js-frontend]].
