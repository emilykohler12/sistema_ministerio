---
name: auth-flujos-correo
description: Trampas de los flujos de Auth por correo del DAM (recuperación #21; sirven para invitaciones de #34): enumeración por mapeo de errores, sesión que deja verifyOtp y AuthContext sin filtro de eventos
metadata:
  type: project
---

En recuperacion-password (2026-10-29, Revisión 1) aparecieron dos huecos que conviene buscar en cualquier flujo de correo
(recuperación, invitaciones o cambio de correo):

1. **Enumeración por el mapeo de errores.** `pedirRecuperacion` mandaba a `'red'` todo error que no fuera el 429. Ese «todo lo demás es red» incluye
   los 4xx/5xx de GoTrue. Un 500 de SMTP solo sale cuando la cuenta existe, porque con una inexistente GoTrue responde 200 sin mandar nada.
   Lo neutro tiene que ser lo que cae por defecto: devolver `'red'` solo con `AuthRetryableFetchError` o `status === 0` (`lib/fetch.js`), o si la llamada lanza.
   auth-js también marca 502/503/504 como `AuthRetryableFetchError`, con el status HTTP.
2. **La sesión que deja `verifyOtp`.** `verifyOtp` guarda la sesión y emite `PASSWORD_RECOVERY` (o `SIGNED_IN`). `AuthContext` no filtra eventos y pone el `usuario`.
   Desde ese momento, cualquier enlace a `/admin/login` termina en `/admin`, por el `Navigate` de `LoginPage`, y también lo hace una recarga. Si el paso siguiente
   (`updateUser`) falla, la persona queda en el panel sin haber terminado el flujo. Los tests de página mockean `consultas` y usan un marcador como ruta del login,
   así que no lo detectan: hay que razonarlo leyendo `AuthContext` y `LoginPage`.

3. **Afirmaciones falsas que se repiten en la doc y en los comentarios** (#53, 2026-10-30):
   - «La sesión vence»: `[auth.sessions]` (`timebox`, `inactivity_timeout`) está comentada en `config.toml`, así que el refresh token no
     vence solo. Lo revoca solo un `signOut` global.
   - «Las páginas de recuperación están fuera de `AuthProvider`»: `AppProviders` envuelve todo el router, así que `AuthContext` sí escucha
     en `NuevaContrasenaPage`.

   Hay que verificar las dos cosas antes de aceptarlas.
4. **Cómo se distingue la sesión de recuperación.** Desde #53, `esSesionDeRecuperacion` la reconoce porque el `amr` del JWT es solo `otp`.
   En #34 (invitaciones), comprobá qué `amr` deja el enlace de invitación: si también es `otp`, el invitado quedará fuera de `/admin` hasta
   fijar la contraseña.

**Why:** el criterio de neutralidad (no revelar cuentas) y la promesa de «sin sesión hasta terminar» se rompen sin que falle ningún test.
**How to apply:** en todo flujo de Auth por correo, buscá los `return 'red'` por defecto y cada salida con una sesión abierta (enlaces o recarga). Ver
[[supabase-js-frontend]] y [[temporizadores-sesion]].
