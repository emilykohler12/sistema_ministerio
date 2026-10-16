---
name: trampas-no-contar-admin
description: Cómo verificar en e2e que una RPC no cuenta para el admin (esperar la respuesta de la RPC)
metadata:
  type: project
---
- Para probar "no cuenta": esperar `page.waitForResponse(r => r.url().includes('/rpc/<nombre>'))` antes de recargar /admin; si no, un "no cambió" puede ser falso por carrera.
- La descarga de normativa se cuenta una vez por pestaña/visita (sessionStorage): usar contexto nuevo para el caso anónimo.
- Contador de normativa en el tablero: `getByRole('region',{name:'Normativas'}).getByRole('row',{name:titulo}).getByRole('cell').last()`.
- El hook de qa bloquea `$(...)` en Bash.
