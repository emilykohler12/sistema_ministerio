# QA 1

## Veredicto
Funciona con observaciones

## Qué probé
- Cierre normal con red (menú lateral): llega a `/admin/login` sin recarga (marca en `window` intacta) — pasó
- Token vigente, sin red, "Cerrar sesión": llega al login sin recarga ni página de error — pasó
- Token vigente, sin red, cierre por inactividad (aviso a los 28 min, cierre a los 30): login sin recarga, con el `alert` "Tu sesión se cerró por inactividad" — pasó
- Token vencido (`expires_at`/`access_token` vencidos en `dam-auth-sesion`), sin red, "Cerrar sesión": la sesión se descarta y el panel desaparece, pero tarda y termina en la página de error del navegador (ver bugs) — pasó el test, con hallazgos
- Tras volver la red, `goto('/admin')` lleva a `/admin/login` (la sesión no revive) — pasó

## Bugs
- **[menor]** Con el token vencido y sin red, el panel sigue visible unos 26 s tras "Cerrar sesión"
  Pasos: 1. Iniciar sesión como admin. 2. Poner `expires_at = 1` y un access token inválido en `sessionStorage['dam-auth-sesion']`. 3. `context.setOffline(true)`. 4. Clic en "Cerrar sesión".
  Esperado: cierre casi inmediato. Obtenido: ~26 s (medido: 25 943 ms) hasta que cambia el documento; sin ningún indicador de que se está cerrando. Se atribuye a los reintentos de auth-js al refrescar el token sin red (`signOut()` tarda en devolver el error); a confirmar con el coordinador si se acepta.
- **[menor]** Con el token vencido y sin red, el usuario termina en la página de error del navegador
  Pasos: los mismos. Esperado (según el plan): llegar al login. Obtenido: la recarga `window.location.assign('/admin/login')` falla sin red y queda `chrome-error://chromewebdata/` (en headless, en blanco). La sesión sí quedó descartada: al volver la red, `/admin` redirige al login. Es consecuencia aceptada del diseño (la recarga necesita red); solo se reporta porque el usuario ve una página de error. Archivo: `src/features/auth/consultas.ts` (`window.location.assign`).

## Observaciones
- `e2e/historial.spec.ts` "filtros inválidos, vacíos y URL compartible" falló una vez en la corrida completa y pasó sola y en una segunda corrida del spec; es sensible al estado de la base dejado por otros specs (no relacionado con este fix). No lo investigué más.
- No probé: scope de otras pestañas, token vencido con inactividad (mismo camino que el cierre manual), ni con red lenta (en vez de cortada).
- Los datos vencidos se simulan editando el storage; no es un token vencido por el servidor.

## Evidencia
`npm run test:e2e -- e2e/signout-sin-red.spec.ts`: 4 passed. `npm run test:e2e` completo: 49 passed, 1 failed (historial, flaky, ver arriba); `historial.spec.ts` solo: 4 passed.
