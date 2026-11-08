# Plan: sesión de recuperación que no cuenta como admin (#53)

**Objetivo.** Que la sesión que abre `verifyOtp` (recuperación) no habilite `/admin` mientras no se cambie la contraseña. Hoy, si `updateUser` falla y se recarga o abandona la pantalla, `/admin` entra sin contraseña.

**Hallazgo (comprobado en local).** El access token de `verifyOtp` con `type: 'recovery'` trae `amr: [{ method: 'otp' }]`. El login con contraseña trae `method: 'password'`. La app no tiene otro flujo con OTP, así que `otp` identifica la sesión de recuperación.

**Diseño.** `AuthContext` no trata como admin una sesión cuyo `amr` es solo `otp`; no la cierra (la página la necesita para reintentar). Es un cierre de cliente, sin cambiar la base. `NuevaContrasenaPage` y `restablecerContrasena` no cambian: el reintento sigue funcionando porque usa el cliente de supabase, no el `usuario` del contexto.

**Archivos.**
- `src/features/auth/esAdmin.ts`: puro; leer `amr` del JWT (decodificar el payload del `access_token`) en una función nueva `esSesionDeRecuperacion(session)`, sin importar el cliente.
- `src/features/auth/AuthContext.tsx`: en el listener, `idActual` es null si `esSesionDeRecuperacion(session)`. Sin cerrarla en ese caso (`NuevaContrasenaPage` la necesita para el reintento) → solo no asignar `usuario`; el cierre por abandono lo resuelve la guarda de `AdminLayout` (sin `usuario` redirige al login).
- Tests junto al código: `esAdmin.test.ts` y `AuthContext.test.tsx` (sesión `otp` → `usuario` null, sin llamar a `cerrarSesion`; sesión `password` → admin).

**Pasos.** Tests en rojo → implementar → `npm run lint`, `typecheck`, `npm test` → e2e: el caso «fallo del cambio + ir a /admin» redirige al login (`e2e/recuperacion-password.spec.ts`).

**Verificación.** Tests unitarios + un e2e; `npm run db:reset` después. Toca rutas y permisos de sesión → `qa` tras el revisor.

**Fuera de alcance.** `PantallaAuth` y `MotivoLogin` (notas de #21), revocar la sesión en el servidor, gestión de usuarios (#34).
