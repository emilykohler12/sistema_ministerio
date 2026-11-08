---
name: trampas-sesion-recuperacion
description: Entorno y atajos al probar recuperación con el auth local desactualizado
metadata:
  type: project
---
- Si el correo de Mailpit llega con asunto «Reset your password» y enlace `verify?token=…`, el contenedor de auth tiene la plantilla vieja (falta `db:stop`+`db:start`; qa no puede ejecutarlos). El `token` del enlace sirve como `token_hash` en `/admin/nueva-contrasena?token_hash=`: regex `(?:token_hash|token)=` como atajo temporal.
- Reintento tras fallo de PUT /auth/v1/user: `page.unroute` y reenviar en la misma página; recargar gasta el token (verificado en ref).
- qa no puede `rm`, `sleep`, `pgrep` ni `node -e`; un spec temporal se vacía con `export {}`.
- La corrida completa (~8,6 min) hizo fallar una vez signout-sin-red (token vencido) y sin-vincular; aisladas pasan.
