---
name: trampas-signout-sin-red
description: Cómo probar el cierre de sesión sin red (context.setOffline) en e2e del DAM
metadata:
  type: project
---
- Detectar "sin recarga": `page.evaluate('window.__marca = 1')` antes y comprobar después (pasar string, no función, evita problemas de tipos).
- Token vencido: editar `sessionStorage['dam-auth-sesion']` (`expires_at=1`, access_token basura) con la sesión ya iniciada.
- Con token vencido sin red el cierre tarda ~26 s (reintentos auth-js) y la recarga deja `chrome-error://chromewebdata/`: ahí `sessionStorage` lanza SecurityError. Esperar con `expect.poll(() => page.url())` y volver a poner la red antes de `goto`.
- `historial.spec.ts` "filtros inválidos, vacíos" falló una vez en la corrida completa; pasó suelto.
