# Contexto: recuperación de contraseña (#21)

Salida del agente Explore. Rutas y líneas al 2026-10-29.

## Código actual
- `src/features/auth/consultas.ts`: `iniciarSesion` (`signInWithPassword`, devuelve `'credenciales' | 'sin-permiso' | 'red'`), `cerrarSesion` (con fallback sin red de #46) y `escucharSesion`
  (`onAuthStateChange`). No hay nada de recuperación ni de cambio de contraseña.
- `AuthContext.tsx:30-48`: único listener; **no filtra por evento**, así que `PASSWORD_RECOVERY` no se maneja. Una sesión de recuperación llega como sesión normal:
  si es admin (`app_metadata.admin`), `setUsuario` y `LoginPage` lo redirige a `/admin` (`LoginPage.tsx:40-42`) **sin haber cambiado la contraseña**; si no es admin, se cierra la sesión
  y se pierde la de recuperación. Hace falta un estado propio «en recuperación».
- `LoginPage.tsx`: zod (`z.email`, password `min(1)`) + RHF, errores en `role="alert"`, motivo de inactividad por `location.state.motivo`. El enlace «¿Olvidaste tu contraseña?» se quitó a
  propósito (`auth-configuracion/spec.md:57`); `LoginPage.test.tsx:143-148` afirma que **no** existe y hay que invertirlo.
- `router.tsx:79`: `/admin/login` está fuera de `AdminLayout`; las rutas nuevas van junto a esa. `AdminLayout` es el único guard (`usuario`).
- `shared/lib/supabase.ts:17-28`: `storage: sessionStorage`, `persistSession`, `autoRefreshToken`; no fija `detectSessionInUrl` (default `true`) ni `flowType` (default implicit).
  Con implicit el enlace llega como `#access_token=…&type=recovery` y dispara `PASSWORD_RECOVERY`. Con PKCE, el code-verifier vive en `sessionStorage` de la pestaña que pidió el correo y
  se pierde si el enlace abre otra pestaña.

## Supabase (`supabase/config.toml`)
- `site_url = http://localhost:5173`; `additional_redirect_urls = ["http://127.0.0.1:5173"]`: hay que agregar la URL exacta de la pantalla nueva (local y nube).
- `minimum_password_length = 6`, `password_requirements = ""`; `enable_signup = false`; `secure_password_change = false`; `max_frequency = "1s"`; rate limit `email_sent = 2` por hora.
- Correo local en Mailpit (puerto 54324, API HTTP en `http://127.0.0.1:54324/api/v1/`). No hay plantilla `[auth.email.template.recovery]`: se usaría la de por defecto, en inglés.

## Seed y e2e
- `scripts/seed-usuarios.mjs`: `admin@dam.local` / `admin-dam-local` y `sin-permiso@dam.local` / `sin-permiso-dam-local`. `e2e/helpers.ts:loginAdmin` depende de la del admin: un e2e que la
  cambie rompe a los demás. Ningún e2e lee correo todavía; no hay helper de Mailpit.

## Documentación
- `docs/definicion-dam.md:201` (§5.2): «Incluye recuperación de contraseña por correo». Sin requisitos de contraseña.
- ADR 0005 (registro público apagado, recuperación por correo personal) y 0014 (la caché se limpia al cambiar el usuario derivado). `auth-configuracion` y `cierre-inactividad` dejaron
  esta feature fuera de alcance.
