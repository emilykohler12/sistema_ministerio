# QA 1

## Veredicto
Funciona

## Qué probé
Spec: `e2e/logo.spec.ts` (Chromium, Supabase local, PNG de 32x32 armado byte a byte y JPG codificado por Chromium).
- Sin logo: portal (encabezado) y panel muestran iniciales, ninguna imagen del bucket, `link[rel=icon]` apunta a `/favicon.svg`, sin «Quitar logo» — pasó
- Escribir en «Misión» sin guardar y «Cambiar logo» con PNG válido: mensaje «Logo actualizado», vista previa y barra del panel con `naturalWidth > 0`, «Misión» conserva lo escrito, foco en «Cambiar logo», un único objeto `<uuid>.png` en el bucket, favicon con la URL del objeto — pasó
- Encabezado y pie del portal con el logo cargado y favicon actualizado — pasó
- Cambiar por `logo.JPEG`: se guarda `<uuid>.jpg`, el PNG anterior desaparece del bucket (queda 1 objeto), favicon y imágenes apuntan al nuevo, foco en «Cambiar logo» — pasó
- Favicon tras cerrar sesión (login) y tras un login nuevo (el login hace `queryClient.clear()`): sigue el logo; al quitarlo vuelve a `favicon.svg` — pasó
- `.gif` y archivo de 3 MB: mensajes «Formato no admitido…» y «La imagen supera el tamaño máximo de 2 MB.», cero peticiones no-GET a `/storage/v1/`, bucket vacío — pasó
- «Quitar logo» + diálogo: «Logo quitado», iniciales, foco en «Cambiar logo», sin imagen del bucket, favicon por defecto, bucket vacío — pasó
- Cada test deja el logo quitado (más limpieza de seguridad antes y después) — pasó

## Bugs
Ninguno encontrado.

## Observaciones
- Tras cerrar sesión desde `/admin/configuracion`, el nuevo login vuelve a esa pantalla (no al dashboard). Es el comportamiento de retorno existente, no del logo; `loginAdmin` espera el dashboard, por eso el test cierra sesión desde el dashboard.
- No probé: corte de red a mitad de un cambio (punto 6 de la verificación), imagen 404 en el navegador (cubierto por tests unitarios), rechazo 413/415 del servidor, vista móvil ni Safari.
- El pie y el encabezado solo se verificaron en el portal en viewport de escritorio.

## Evidencia
`npm run test:e2e -- e2e/logo.spec.ts`: 4 passed. `npm run typecheck` limpio; `npm run lint` sin errores (3 warnings preexistentes ajenos). `npm run db:reset && npm run test:e2e && npm run db:reset` completo: 82 passed (11.5 min).
