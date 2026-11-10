---
name: trampas-subida-reanudable
description: Cómo probar la subida TUS (page.route, compuertas, status duplicado) en e2e/subida-reanudable
metadata:
  type: project
---
- `getByRole('status')` resuelve a 2 elementos en RecursosPage (el del layout vacío + el sr-only de subida): usar `.filter({ hasText: /./ })`.
- Buffer de 13 MiB = 3 PATCH de 6 MiB. Retener el 2.º PATCH con una promesa (compuerta) da progreso intermedio estable; sin esperas por tiempo.
- Barra: `getByRole('progressbar', { name: '<archivo>.pdf' })`; botón: `Cancelar la subida de <archivo>.pdf` (aria-label, no «Cancelar» a secas).
- Corte: `route.abort('connectionfailed')` en el 2.º PATCH y retener el HEAD con otra compuerta para ver «Sin conexión, reintentando…».
- 413 simulado: `route.fulfill` del POST de creación con JSON `{statusCode:'413'}`; el local no rechaza por tamaño real.
- Navegar durante la subida: `page.goBack()` vuelve a la pantalla; el DELETE al endpoint TUS se espera con `waitForRequest`.
- Tras cancelar un reemplazo el foco va a `Reemplazar <nombre>`; tras cancelar en el alta, al input del dropzone.
- El `run_in_background` del suite completo no se puede sondear con until/sleep (hook qa): esperar la notificación.
