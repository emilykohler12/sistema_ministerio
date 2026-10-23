# QA 1

## Veredicto
Funciona

## Qué probé
Chromium contra el Supabase local, con `page.clock` (sin esperar tiempo real). Spec: `e2e/cierre-inactividad.spec.ts`.
- Aviso a los 28 min como `alertdialog` "Tu sesión está por cerrarse", con el foco en "Seguir conectado" — pasó
- "Seguir conectado" cierra el aviso y reinicia el plazo (20 min después no hay aviso ni cierre) — pasó
- Sin responder: aviso a los 28 min y cierre a los 30; llega a `/admin/login` con el `role="alert"` "Tu sesión se cerró por inactividad" — pasó
- Tras iniciar sesión de nuevo vuelve a `/admin/normativas`, donde estaba — pasó
- Aviso sobre el diálogo "Agregar enlace" con texto escrito: Escape cierra solo el aviso; el diálogo de abajo sigue abierto con lo cargado — pasó
- Pestaña oculta pasados 31 min (hora del sistema saltada + `visibilitychange`): cierra y muestra el mensaje — pasó
- Portal público (`/`): 31 min después, sin aviso ni cambios — pasó
- 320 px: el aviso queda dentro del viewport y sin scroll horizontal — pasó
- Sondeo manual (no queda como test): el foco vuelve al enlace del menú que lo tenía antes (tanto con el botón como con Escape); con el aviso visible, un clic dentro, scroll de rueda y Tab no lo ocultan ni reinician el plazo, y el foco se queda en "Seguir conectado"; la cuenta regresiva (`role="timer"`) y el `role="status"` ("Quedan 2 minutos...") se ven bien; sin errores ni avisos en la consola.

## Bugs
Ninguno.

## Observaciones
- No probé con un lector de pantalla real: la sobriedad del anuncio de la cuenta regresiva no se puede juzgar con Playwright.
- No probé la actividad real durante los primeros 28 min (clic o tecla que reinician); lo cubren los tests unitarios con timers falsos.
- No probé varias pestañas (cada una tiene su temporizador, por decisión del plan).
- Dejé `e2e/sonda-foco.spec.ts` vacío (solo un comentario y `export {}`): el perfil qa no puede borrar archivos. Conviene borrarlo.
- El "Dashboard" duplicado como h1 en móvil rompe `loginAdmin` si se achica la ventana antes de entrar (ya conocido); el spec de 320 px redimensiona después del login.

## Evidencia
`npm run test:e2e`: 46 passed (4.8 min), incluidos los 5 nuevos de `cierre-inactividad.spec.ts`. `npm run db:reset` al terminar: ok.
