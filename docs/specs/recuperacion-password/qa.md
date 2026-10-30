# QA 1 — Recuperación de contraseña (#21)

## Veredicto
Funciona con observaciones (sin bugs encontrados).

## Qué probé
Spec: `e2e/recuperacion-password.spec.ts` (7 tests), Chromium contra el Supabase local con la config nueva (el asunto del correo salió en español: la plantilla estaba cargada).
- Enlace «¿Olvidaste tu contraseña?» del login lleva a `/admin/recuperar` (criterio 1) — pasó
- Correo mal formado: error asociado al campo (`aria-describedby`) y ninguna llamada a `/auth/v1/recover` (3) — pasó
- Aviso neutro idéntico (texto) para `recuperacion@dam.local` y para un correo inexistente; el aviso recibe el foco; en Mailpit llega 1 solo correo (2) — pasó
- Correo en español (asunto «Recuperá tu contraseña del panel DAM», botón «Elegir una contraseña nueva», enlace `/admin/nueva-contrasena?token_hash=`) (4) — pasó
- Enlace abierto en otro contexto: se ve el formulario; `/admin` y recargar redirigen al login; el token no se gastó (después sirvió para guardar) (4) — pasó
- 7 caracteres y confirmación distinta: errores junto al campo (5) — pasó
- Contraseña actual: alerta enfocada «Esa ya es tu contraseña actual…», «Ir a ingresar» lleva a `/admin/login` mostrando el formulario (no redirige al panel) (6) — pasó
- Cambio válido con contraseña aleatoria: llega a login con «Contraseña actualizada. Ingresá con la nueva.» en `role=status` enfocado; la vieja da «Correo o contraseña incorrectos» y la nueva entra (6) — pasó
- Enlace ya usado y `/admin/nueva-contrasena` sin token_hash: alerta «El enlace venció o ya se usó» con «Pedir otro enlace» (8) — pasó
- Criterio 7: control con refresh token vigente = 200; tras el cambio desde otro contexto, el refresh token de la otra sesión falla (>= 400) — pasó
- Token fuera de la URL tras el éxito (10) — pasó
- Cuenta sin marca (`sin-permiso@dam.local`): «Tu cuenta no tiene permisos de administrador» y su contraseña sembrada sigue valiendo (9) — pasó
- 320 px sin scroll horizontal en login, recuperar y nueva-contrasena; Tab en recuperar recorre campo, botón, enlace — pasó

## Bugs
Ninguno encontrado.

## Observaciones
- No pude comprobar en `auth.sessions` que GoTrue revoca las otras sesiones: el perfil qa no tiene acceso a la base. La evidencia es indirecta pero concluyente: el refresh token que renovaba (200) deja de funcionar tras el cambio.
- El mínimo de 8 del servidor no se probó por separado: con 7 caracteres el zod del cliente corta antes de llamar a Supabase. Que la config de GoTrue esté en 8 queda sin verificar de forma directa (solo se verificó que la plantilla nueva está cargada).
- Un enlace vencido o usado muestra el formulario al abrirlo y recién al guardar sale «venció o ya se usó» (es consecuencia del diseño: abrir no verifica; el criterio 8 dice «se abre o se envía»). Solo sin `token_hash` el aviso es inmediato. Confirmar que es lo deseado.
- No probé `user_banned`, `weak_password`, 429 ni el fallo de red (spec: unitario).
- Teclado y lector: probé el orden de Tab solo en recuperar; no hay prueba con lector de pantalla.
- Mailpit se consulta con la `request` de Playwright, vaciando los mensajes al empezar cada pedido; el spec asume Mailpit en 127.0.0.1:54324 y la API de auth en 127.0.0.1:54321.

## Evidencia
`npm run test:e2e -- e2e/recuperacion-password.spec.ts`: 7 passed (39.6 s). `npm run test:e2e` completo: 57 passed (6.0 m). Al terminar corrí `npm run db:reset`.
