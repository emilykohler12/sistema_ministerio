# QA 1 — subida reanudable y barra de progreso (#29)

## Veredicto
Funciona con observaciones. No encontré bugs de la app en lo que se probó. La feature rompió un e2e existente (`e2e/descargas.spec.ts`, por un supuesto del test sobre la ruta de subida); ya lo ajusté.

## Qué probé
Contra el Supabase local, Chromium, `e2e/subida-reanudable.spec.ts` (8 tests, `page.route` sobre `/storage/v1/upload/resumable`, buffer de 13 MiB = 3 trozos, esperas por evento):
- Subida de tres trozos: progreso intermedio (0 < value < 100) con «Cancelar la subida de …» visible, luego el recurso aparece, la barra desaparece y el `status` dice «<archivo> subido» — pasó.
- PATCH cortado (`connectionfailed` en el 2.º): «Sin conexión, reintentando…», el reintento arranca con `Upload-Offset` >= 6 MiB (no repite desde 0) y completa; el recurso aparece — pasó.
- Cancelar durante una demora: sale un DELETE al endpoint TUS, `status` «<archivo> cancelado», sin `alert`, sin fila, tampoco tras recargar — pasó.
- Cancelar un reemplazo: la fila conserva su contenido anterior, el foco va a «Reemplazar <nombre>», igual tras recargar — pasó.
- 413 simulado en el POST de creación (lote de 2): `alert` con el archivo rechazado y el segundo del lote se sube — pasó (el 413 es simulado con `route.fulfill`; el local no rechaza por tamaño dentro de 50 MiB).
- Lote de 2: cancelar el que está «En espera» no frena al que sube; sin alerta — pasó.
- Teclado: foco en «Cancelar» + Enter aborta (DELETE), el foco vuelve al input del dropzone y no hay errores ni avisos de consola durante todo el flujo — pasó.
- Navegar a otra pantalla (Dashboard) durante una subida: sale el DELETE, al volver (atrás) no hay fila — pasó.

Regresión: `recursos`, `normativas-admin` y `subida-reanudable` pasan. En el e2e completo hubo 7 fallos; tras aislarlos:
- `descargas.spec.ts` (2 tests): **fallaban de forma determinista**. El helper `tallerConArchivo` capturaba la ruta del objeto del `POST /storage/v1/object/talleres/<ruta>`, que ya no existe porque la subida es TUS. Test desactualizado, no bug de la app. Arreglado leyendo `objectName` de `Upload-Metadata` del POST de creación del upload; pasan.
- `no-contar-admin`, `signout-sin-red`, `sin-vincular` (2), `talleres-admin`: pasaron aislados. Atribuyo el fallo al flaky conocido (#61) y a carga: durante el e2e completo yo estaba corriendo `npm test` (Vitest) en la misma máquina, lo que seguramente agravó los timeouts. `sin-vincular` y `talleres-admin` no figuraban en la lista del flaky conocido: conviene repetir el e2e completo sin carga paralela para confirmarlo.

## Bugs
Ninguno.

## Observaciones
- No probé: aspecto visual (barra, textos cortados, mobile 320 px), anillo de foco del dropzone, `beforeunload` con diálogo, corte de red real (DevTools Offline), expiración del token (criterio 8), un lote de 3 con cancelación del primero mientras sube, ni el 415 real. Quedan para una pasada manual.
- El 413 y el corte se simulan; el servidor local usa el backend de archivos y no cubre la regla de trozos de 6 MiB de S3 (paso 7 de la spec, manual contra demos).
- Hay dos `role="status"` en la pantalla (uno vacío del layout y el sr-only de subida): sin impacto, pero los tests deben filtrar por texto.
- Cualquier spec futuro que necesite la ruta del objeto subido debe leerla de `Upload-Metadata` (TUS), no del POST a `/object/`.

## Evidencia
- `npx playwright test e2e/subida-reanudable.spec.ts`: 7 passed (52.8 s) y luego el test de teclado: 1 passed (el spec tiene 8 tests).
- `npm run test:e2e` completo: 71 passed, 7 failed (17.3 min); aislados: `descargas` 2 fallos (arreglados, luego 2 passed), los otros 5 pasan; aislado recursos + normativas-admin + sin-vincular + talleres-admin + no-contar-admin + signout-sin-red: 15 passed, 2 failed (solo descargas, antes del arreglo).
- `npm run lint`: solo avisos preexistentes en archivos ajenos; `npm run typecheck` y `npm test` sin errores.
- `npm run db:reset` al final.
