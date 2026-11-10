# QA 1: limpieza de huérfanos en Storage (#28)

## Veredicto
Funciona con observaciones. Sin bugs en el script.

## Qué probé
Spec `e2e/limpiar-storage.spec.ts` (sin navegador): siembra con supabase-js y service_role local y lanza `npm run storage:limpiar` con `execFile`. Motivo: el perfil qa no puede correr `npm run storage:limpiar` ni `node` desde Bash, así que lo invoca el spec. «Viejo» sin tocar `created_at`: se sembró, se esperó más de 65 s (`expect.poll` sobre `created_at`) y se usó `--edad-minima=1`; los «jóvenes» se subieron después de esa espera.
- 1. Un huérfano viejo, uno joven y uno referenciado en `talleres` (carpeta `<taller_id>/`) y en `normativas` (`<uuid>.pdf`); más un huérfano viejo en una carpeta de taller inexistente, un recurso y una normativa sin archivo — pasó
- 2. Simulación: informa huérfanos (3), jóvenes protegidos, conservados y filas sin archivo, no borra nada — pasó
- 3. `--aplicar`: borra solo los 3 huérfanos viejos (incluido el de la carpeta sin taller); referenciados y jóvenes siguen; enlace firmado del recurso y URL pública de la normativa dan 200 — pasó
- 4. Argumentos inválidos (`--edad-minima=x`, `=-1`, `=`, sin `=`, `--edad-minima 5`, `--aplicar=1`, `--foo`, argumento suelto): salen con 1, con mensaje claro y sin imprimir `Destino:` (no conectan) — pasó
- 5. Falla cerrada: destino remoto inalcanzable (`qa-inexistente.invalid` con `--confirmar`) da «No se pudo listar talleres/: fetch failed», sale con 1 y no borra — pasó. No pude provocar un error de lectura contra el Supabase local (no puedo detenerlo ni usar una clave inválida: la rama local ignora la clave del entorno). El caso «clave inválida» con `localhost.:54321` falló por resolución, no por permiso: no cuenta como prueba de clave inválida.
- 6. Alta en curso con la edad por defecto (60): simulación y `--aplicar` no borran (los tres quedan como «jóvenes», `0 huérfanos borrados`) — pasó
- 7. Idempotencia: la segunda corrida con `--aplicar` informa 0 huérfanos y 0 borrados — pasó
- Regresión: `e2e/normativas-admin.spec.ts` y `e2e/recursos.spec.ts` (3 tests) — pasaron

## Bugs
Ninguno.

## Observaciones
- Falla cerrada probada solo con `fetch failed`; la rama «`remove()` devuelve menos de lo pedido» y errores de permiso/HTTP en el listado no se ejercitaron (cubierto, si acaso, por lectura del código).
- No probé más de 100 objetos por carpeta (paginación del listado) ni más de 1000 filas referenciadas; solo lectura del código.
- Los tamaños salen como `0.0 KiB` para objetos de 11 bytes: correcto pero poco informativo para archivos chicos.
- Pendiente de limpieza por el coordinador: el perfil qa no puede borrar archivos y quedó `e2e/qa-sembrar-huerfanos.ts` (vaciado, solo `export {}`); borrarlo. `e2e/limpiar-storage.spec.ts` se puede conservar o quitar: tarda ~1,3 min por la espera de edad y no es una prueba de navegador.
- Terminado con `npm run db:reset` (los datos sembrados y el taller de prueba ya no existen).

## Evidencia
```
npm run test:e2e -- e2e/limpiar-storage.spec.ts   -> 9 passed (1.3m)
npm run test:e2e -- e2e/normativas-admin.spec.ts e2e/recursos.spec.ts -> 3 passed (24.0s)
--aplicar --edad-minima=1: talleres Huérfanos: 2 (1/viejo.pdf, 900903/viejo.pdf); normativas Huérfanos: 1; «Borrados: 3 de 3.»
segunda corrida: «Borrados: 0 de 0.»  · con edad 60: «0 huérfanos borrados»
```
