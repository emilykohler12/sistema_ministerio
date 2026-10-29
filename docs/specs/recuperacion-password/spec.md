# Recuperación de contraseña (#21)

- **Estado:** aprobada
- **Autor:** Emily Kohler + Claude
- **Fecha:** 2026-10-29

## Objetivo
Que una persona administradora que olvidó su contraseña pueda definir una nueva por correo, sin pedírsela a otra persona (§5.2, ADR 0005). Hoy el login no tiene ese camino.

## Criterios de aceptación
1. Dado el login, cuando se ve, entonces hay un enlace «¿Olvidaste tu contraseña?» a `/admin/recuperar`.
2. Dado `/admin/recuperar`, cuando se envía un correo válido (exista o no, sea admin o no, o aunque Supabase responda por exceso de envíos), entonces se muestra siempre el mismo aviso neutro
   («Si el correo corresponde a una cuenta, te enviamos un enlace. Si no llega en unos minutos, revisá spam o volvé a pedirlo más tarde»). Solo un fallo sin respuesta del servidor (la llamada lanza o `status 0`) tiene mensaje propio; un 4xx o 5xx también da el aviso neutro, porque un 500 por SMTP solo sale para cuentas reales.
3. Dado un correo mal formado, cuando se envía, entonces el error se ve junto al campo y no se llama a Supabase.
4. Dado el correo recibido (en español, con el enlace `…/admin/nueva-contrasena?token_hash=…`), cuando se abre en cualquier pestaña o navegador, entonces se ve el formulario de contraseña nueva
   **sin que exista ninguna sesión**: abrir el enlace no consume el token ni deja al usuario autenticado.
5. Dado el formulario, cuando se guarda una contraseña de menos de 8 caracteres, de más de 72 **bytes** o que no coincide con la confirmación, entonces el error se muestra junto al campo.
6. Dada una contraseña válida, cuando se guarda, entonces en este orden: se verifica el token (`verifyOtp`), se actualiza la contraseña, se cierra la sesión y recién después se navega a `/admin/login` con el aviso
   «Contraseña actualizada. Ingresá con la nueva» en un `role="status"`. Si la actualización falla (red, `same_password`), el reintento **no** vuelve a verificar el token, que ya se consumió.
   `same_password` dice «Esa ya es tu contraseña actual: ingresá con ella o elegí otra», y su enlace cierra la sesión que abrió `verifyOtp` antes de navegar al login (si no, el login redirigiría al panel).
   Un error que no es `otp_expired` ni `user_banned` es «No se pudo completar. Intentá de nuevo en unos minutos; si sigue fallando, pedí otro enlace», sin afirmar una causa.
7. Dada la contraseña cambiada, entonces las otras sesiones de esa cuenta **dejan de poder renovarse** (un `refreshSession` con un refresh token anterior falla). Su access token vigente vence en hasta 1 h.
8. Dado un enlace vencido, usado, ausente (sin `token_hash`) o de una cuenta desactivada (`user_banned`), cuando se abre o se envía, entonces un `role="alert"` lo explica y ofrece pedir otro enlace.
9. Dada una cuenta sin la marca admin, cuando verifica el enlace, entonces no se actualiza la contraseña, se cierra la sesión y se muestra «Tu cuenta no tiene permisos de administrador».
10. Dado el login, `/admin/recuperar` y `/admin/nueva-contrasena`, cuando se navega con teclado y lector, entonces los campos tienen `Label`, error asociado con `aria-describedby`, foco en el error o el aviso, y sin scroll horizontal en celular.

## Diseño
- `features/auth/consultas.ts` — `pedirRecuperacion(email)` (`resetPasswordForEmail`, errores a códigos del dominio; el 429 cuenta como éxito) y `restablecerContrasena(tokenHash, password)`:
  `verifyOtp({ token_hash, type: 'recovery' })`, comprobación `esAdmin`, `updateUser` y `cerrarSesion()`. **No se toca `cerrarSesion`** ni el fallback de #46: `signOut` ya es global.
- `features/auth/hooks/` — una mutación por operación; la página no llama a `consultas`. Guarda que el token ya se verificó para el reintento. `AuthContext` no cambia: el `usuario` es admin un instante entre
  `verifyOtp` y el cierre, sin efecto visible porque las dos pantallas están fuera de `AdminLayout`.
- `features/auth/esquema.ts` (puro) — zod del correo y de la contraseña nueva (mín. 8, máx. 72 bytes con `TextEncoder`, confirmación igual).
- `pages/admin/RecuperarPage.tsx` y `NuevaContrasenaPage.tsx` — rutas públicas junto a `/admin/login` en `router.tsx`. Reutilizan `Button`, `Input`, `Label`, `FieldError` y el nuevo `shared/components/ui/InputPassword`
  (el ojo de mostrar/ocultar, extraído de `LoginPage`).
- `LoginPage.tsx` — enlace, aviso `motivo = 'contrasena-actualizada'`, `InputPassword`; el test que afirma que el enlace no existe se invierte.
- `supabase/config.toml` y `supabase/templates/recuperacion.html` — `minimum_password_length = 8`, plantilla en español con `{{ .SiteURL }}/admin/nueva-contrasena?token_hash={{ .TokenHash }}&type=recovery`, `email_sent` más alto en local.
  Sin `redirectTo` ni `additional_redirect_urls`.
- `scripts/seed-usuarios.mjs` — usuario dedicado `recuperacion@dam.local` (con la marca admin) para el e2e, que fija una contraseña aleatoria por corrida y lee el último correo de Mailpit con `expect.poll`.
- Decisiones de la entrevista y la crítica: `token_hash` + `verifyOtp` en lugar de implicit (sin sesión hasta enviar; sirve en cualquier pestaña; los antivirus de correo no gastan el token); mínimo 8 sin composición;
  respuesta siempre neutra; rutas separadas. La diferencia de tiempos entre cuenta real e inexistente se acepta (padrón chico, correos institucionales).

## Fuera de alcance
- Configuración de la nube (URL del sitio, plantilla y SMTP en el dashboard): checklist en el PR.
- Cambiar la contraseña con sesión iniciada, bloqueo por intentos, captcha, MFA y gestión de usuarios (#34).
- `weak_password` y el 429 se prueban con test unitario y error mockeado, no en e2e.
- **Riesgo aceptado:** si `updateUser` falla y la persona abandona o recarga, la sesión que abrió `verifyOtp` queda en el `sessionStorage` de esa pestaña. Quien tiene el enlace ya podía fijar la contraseña; no hay escalada. No se cierra al desmontar (carrera con el login y `StrictMode`).

## Verificación de punta a punta
1. Reiniciar el Supabase local (`db:stop` + `db:start`) si `db:reset` no recarga la config de auth; `npm run dev`. Desde el login, pedir el enlace para `recuperacion@dam.local` y para un correo inexistente: mismo aviso.
2. Abrir Mailpit (`http://127.0.0.1:54324`) y el enlace en otra pestaña: se ve el formulario, **no** el panel, y recargar o ir a `/admin` no entra.
3. Probar 7 caracteres, confirmación distinta y la contraseña actual; luego una válida: login con el aviso, la vieja ya no sirve. Reabrir el enlace: «enlace vencido» con opción de pedir otro.
4. `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm test`.
