---
name: supabase-auth-eventos
description: Comportamiento verificado de auth-js 2.117 que afecta flujos por correo (recuperación, invitación de #34): orden INITIAL_SESSION/PASSWORD_RECOVERY, BroadcastChannel entre pestañas, hash que queda en el historial, signOut global por defecto, token_hash + verifyOtp
metadata:
  type: project
---

Verificado en `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js` durante la crítica de la spec `recuperacion-password` (#21, 2026-10-29):
- **Implicit (`#access_token` en la URL):** `_initialize` guarda la sesión y emite `PASSWORD_RECOVERY` en un `setTimeout(0)`. `INITIAL_SESSION` (que sale de
  `onAuthStateChange` después de `initializePromise`) llega **antes**, con la misma sesión y sin nada que la distinga. Si el `useEffect` se suscribe tarde, el
  evento se pierde. Al recargar, la sesión vuelve de `sessionStorage` como una sesión normal de admin.
- **Limpieza del hash:** se hace con `window.location.hash = ''`, que **agrega** una entrada al historial. El `refresh_token` queda en «Atrás».
- **`BroadcastChannel` por `storageKey`:** los eventos de una pestaña (`PASSWORD_RECOVERY`, `SIGNED_OUT`, `USER_UPDATED`) llegan a los listeners de las otras
  pestañas sin tocar su storage. Un `SIGNED_OUT` reenviado oculta el panel, pero la otra pestaña conserva su sesión hasta que recarga.
- **`signOut()`:** es `scope: 'global'` por defecto. GoTrue revoca las otras sesiones al cambiar la contraseña (`LogoutAllExceptMe`). Revocar no invalida los access
  tokens vigentes (`jwt_expiry` 3600).
- **`verifyOtp({ token_hash, type })`:** emite `PASSWORD_RECOVERY` o `SIGNED_IN` y no depende de la URL ni de la pestaña.

Lo que propuse para #21: que la plantilla lleve `{{ .SiteURL }}/ruta?token_hash={{ .TokenHash }}` y que la página llame a `verifyOtp` al enviar. Así no hay sesión
antes de enviar, se resiste a los antivirus que abren los enlaces del correo y no hace falta `redirectTo`. Además: el 429 de `/recover` solo sale con cuentas
reales (enumeración), y el máximo de bcrypt es de 72 bytes, no de 72 caracteres.

Visto en la crítica del código de #21 (2026-10-29):
- La sesión que abre `verifyOtp` la toma `AuthContext` como admin. Si `updateUser` falla y se deja la sesión para reintentar, cualquier `Link` a
  `/admin/login` termina en el panel por la redirección de `LoginPage` cuando ve `usuario`. La recomendación fue cerrarla al hacer clic y no al desmontar,
  porque el cleanup compite con el `Navigate` y con `StrictMode`.
- Los errores de auth-js: los 5xx y los fallos de red llegan como `AuthRetryableFetchError` (`lib/fetch.js`). Lo desconocido no conviene mapearlo a
  «enlace vencido» (un 429 de `token_verifications` no consume el token) ni a «revisá tu conexión» (en la nube, lo que suele fallar es el SMTP). Mejor una lista
  blanca: `otp_expired` y `user_banned` van a enlace inválido, y el resto a «reintentar o pedir otro».

**Why:** son comportamientos de la librería que no se ven en los tests con mocks. #34 (invitar por correo) va a repetir el mismo tipo de flujo.

**How to apply:** en toda spec que reciba un enlace de Supabase Auth por correo, revisar en la `## Respuesta` de `docs/specs/recuperacion-password/critica.md`
qué se aceptó, y volver a verificar el código de auth-js si cambió la versión. Relacionado: [[supabase-auth-rls-trampas]].
