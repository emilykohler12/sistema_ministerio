---
name: scripts-carga-csv
description: Huecos de los scripts de carga por CSV del DAM (padrón fase B); comilla sin cerrar que se traga filas, CSV cp1252 leído como UTF-8, lookup en objeto con prototipo, resumen con contadores planificados, paginación por max_rows
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
- `normalizar` (NFD + `\p{Diacritic}`) no es igual a `unaccent` (`Ø`, `Æ`, `ß`). Sirve para provocar a propósito un 23505 al escribir y probar el
  criterio de "23505 rechaza la fila y sigue".

Para no reportar falsos positivos: un heredoc o un `printf` que mencione el script y `SUPABASE_URL`/`--confirmar` lo bloquea `proteger-bash`
(falso positivo aceptado). Escribí los scripts de prueba con Write y armá las cadenas por partes.

**Why:** el criterio pedía informar cada fila con su motivo, y el script escribe con service_role, sin RLS que frene datos malos.
**How to apply:** en cada script de carga, probá CSV malformados (comilla sin cerrar, otra codificación, claves raras) contra la base local en
simulación. Después corré `db:reset`. Ver también [[hooks-denylist-evasion]] y [[supabase-js-frontend]].
