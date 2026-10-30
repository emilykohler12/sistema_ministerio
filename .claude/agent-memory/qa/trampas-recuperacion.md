---
name: trampas-recuperacion
description: Cómo probar el flujo de correo de recuperación (Mailpit, sesiones, token) en e2e
metadata:
  type: project
---
- El perfil qa no puede usar curl ni python ni sed: Mailpit se consulta con la fixture `request` (`DELETE /api/v1/messages`, `GET /search?query=to:<correo>`, `GET /message/<ID>` -> `HTML`, `Subject`).
- Token: regex `token_hash=([^&"'\s]+)` sobre el HTML; abrir en `browser.newContext({baseURL})` aparte.
- Un enlace gastado muestra el formulario al abrirse; el alert sale recién al enviar (solo sin token_hash es inmediato).
- Sesión del cliente: `sessionStorage['dam-auth-sesion']` (refresh_token); `apikey` se captura de requests a `/auth/v1/`; refresh = POST `http://127.0.0.1:54321/auth/v1/token?grant_type=refresh_token`. Control: refrescar antes (200) y probar el token nuevo después.
- La cuenta `recuperacion@dam.local` cambia de clave en cada test: cada test fija la suya con `fijarContrasena`.
