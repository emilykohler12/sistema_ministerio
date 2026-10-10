# Padrón — fase B (script de carga)

- **Estado:** implementada (sin la muestra; los supuestos son los de `spec.md`)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-10
- **Decisión:** [0019](../../decisiones/0019-script-de-carga-del-padron.md)

## Objetivo
Cargar el padrón inicial desde un CSV y poder repetir la carga sin duplicar nada, con un informe de rechazos por fila. Está armado
con los supuestos de la muestra: trae CUE, tiene una fila por establecimiento y cada establecimiento está en una sola localidad.
Cuando llegue la muestra real (C-08), cambian `leerFilas` y las columnas, no el plan.

## Criterios de aceptación
1. `npm run padron:importar -- <csv>` sin `--aplicar` imprime altas, cambios y rechazos (con número de fila y motivo) y no escribe nada.
2. Con `--aplicar` escribe. Si se vuelve a correr sobre el mismo CSV, informa 0 altas y 0 cambios.
3. Un CUE que ya existe actualiza `nombre` y `localidad_id` si difieren. Nunca toca `activo`, ni los establecimientos ausentes del CSV, ni los que no tienen CUE.
4. Se rechazan:
   - fila sin CUE o con un CUE que no es `^[0-9]{1,20}$`;
   - nombre vacío o de más de 200 caracteres;
   - localidad desconocida;
   - CUE o (localidad, nombre) repetidos dentro del CSV;
   - CUE nuevo cuyo (localidad, nombre) ya existe en la base;
   - cambio que choca con otro establecimiento.
5. Un 23505 al escribir rechaza esa fila y la carga sigue. El código de salida es 1 si hubo rechazos o errores, y 0 si no.
6. El nombre se limpia antes de comparar y de guardar:
   - espacios de los extremos (incluido U+00A0);
   - espacios internos repetidos, que quedan en uno.

   La localidad se busca por nombre normalizado, sin mayúsculas, tildes ni espacios. Si no aparece, se busca en `equivalencias`.
7. Sin `SUPABASE_URL`, el script usa `supabase status` (local). Con una URL no local, exige `SUPABASE_SERVICE_ROLE_KEY` y `--confirmar=<host>` igual al host de la URL; si falta algo, aborta antes de leer la base.
8. `proteger-bash` bloquea `padron:importar` o `importar-padron` cuando el comando incluye `--confirmar` o `SUPABASE_URL`. La corrida local no se bloquea.

## Diseño
- `scripts/lib/entorno.ts`: `esUrlLocal` y `resolverDestino(env, args)`. Es puro, así que también lo puede usar `seed-usuarios.mjs`.
- `scripts/padron/csv.ts`: `parsearCsv(texto)` según RFC 4180 (comillas, comillas dobles, CRLF y BOM), separador `,` o `;` detectado en el encabezado. `leerFilas` mapea las columnas `cue,nombre,localidad`, sin distinguir mayúsculas.
- `scripts/padron/planificar.ts`: `planificar(filas, existentes, localidades, equivalencias) → {altas, cambios, rechazos}`. Es puro y reutiliza `normalizar` de `src/shared/lib/texto.ts` con import relativo `.ts`.
- `scripts/padron/equivalencias.ts`: mapa vacío y comentado. Se completa con la muestra.
- `scripts/importar-padron.ts`:
  1. lee el CSV;
  2. trae `localidad` y `establecimiento` completos, paginando de a 1000 con `range`;
  3. planifica e imprime el informe;
  4. con `--aplicar`, escribe fila por fila.

  Usa supabase-js con service_role, así que la auditoría registra `usuario_id NULL`.
- `scripts/padron/ejemplo.csv`: CSV sintético con un caso de cada tipo.
- `package.json`: script `"padron:importar": "node scripts/importar-padron.ts"`.
- `tsconfig.node.json`: `scripts/**/*.ts` dentro de `include`.
- `.claude/hooks/proteger-bash.mjs` y su test en `src/test/hooks/`: la regla del criterio 8.
- Tests de Vitest: `csv.test.ts`, `planificar.test.ts` y `entorno.test.ts` junto a cada módulo.

## Fuera de alcance
- Correrlo contra la nube (lo hace una persona).
- La carga real.
- Las columnas o los niveles que traiga la muestra.

## Verificación
1. `npm run db:reset`.
2. Simular: `npm run padron:importar -- scripts/padron/ejemplo.csv` informa y la base no cambia.
3. Con `--aplicar` escribe; repetirlo da 0 altas y 0 cambios.
4. Las altas aparecen en `/admin/establecimientos`.
5. Checks: `npm test`, `typecheck`, `lint` y `test:db`.
