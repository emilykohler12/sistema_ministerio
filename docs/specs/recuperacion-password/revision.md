# Revisión 1: recuperación de contraseña (#21)

Revisé el cambio sin commitear contra HEAD (`4194058`). El `main` local está atrasado (#51) y `git diff main` mezcla rango-fechas.
Leí los archivos nuevos y comparé con auth-js 2.117 (`GoTrueClient.js`: `resetPasswordForEmail`, `verifyOtp`; `lib/fetch.js`).

## Veredicto
Cambios necesarios

## Problemas
- **[importante]** `src/features/auth/consultas.ts:52-58`: cualquier error de `resetPasswordForEmail` que no sea el 429 termina en `'red'`, y eso incluye
  las respuestas del servidor (`AuthApiError` con status 4xx/5xx). GoTrue solo intenta mandar el correo si la cuenta existe, así que un 500 por falla de SMTP
  sale solo para una cuenta real. Con un correo inexistente la respuesta es 200 y se ve el aviso neutro. Eso permite enumerar cuentas mientras el SMTP falle,
  y va contra el criterio 2 («Solo un fallo de red tiene mensaje propio»). El test (`consultas.test.ts`, «un error de red devuelve red») solo prueba un error de red.
  Arreglo: devolver `'red'` solo si `esErrorDeRed(error)` (o si se lanza), y `'ok'` en cualquier otro caso. Sumar tests con un 500 y un 400 que esperen `'ok'`.
- **[importante]** `src/pages/admin/NuevaContrasenaPage.tsx:27-33` y `LoginPage.tsx:39-41`: si `verifyOtp` sale bien y `updateUser` falla (`same_password`, red, débil),
  queda abierta una sesión de admin. `verifyOtp` emite `PASSWORD_RECOVERY` y `AuthContext` no filtra eventos, así que pone el `usuario`. El enlace «Ir a ingresar»
  del mensaje de `same_password` lleva a `/admin/login`, y `LoginPage` ve el `usuario` y redirige a `/admin`. La persona entra al panel sin pasar por el login y
  sin haber fijado una contraseña. Eso contradice el criterio 6 («con enlace al login») y el supuesto del diseño («sin efecto visible porque las dos pantallas
  están fuera de `AdminLayout`»). No es una escalada, porque quien tiene el token ya podía fijar la contraseña. Pero reaparece el «entrar al panel sin cambiar
  la contraseña» que la crítica (puntos 1 y 3) quería eliminar. Pasa lo mismo si después de un fallo se recarga la página: el hook pierde `yaVerificado`,
  el token ya se consumió y sale «enlace vencido», pero la sesión sigue en `sessionStorage` y `/admin` entra. Ningún test cubre esto (la página mockea consultas
  y la ruta del login es un marcador).
  Arreglo mínimo: que «Ir a ingresar» sea un botón que corra una mutación del hook que llame a `cerrarSesion()` y después navegue al login. Así se sigue sin tocar
  `cerrarSesion` ni `AuthContext`. Test: tras `misma-contrasena`, pulsar el enlace llama a `cerrarSesion` antes de navegar. El caso de la recarga puede quedar
  como issue si se decide aceptarlo, pero tiene que quedar escrito en la spec.
- **[importante]** `src/pages/admin/LoginPage.tsx:67-71`: el aviso «Contraseña actualizada» es `{cond && <p role="status">}` y se monta junto con la página,
  sin mover el foco. Una región viva que aparece con su texto no se anuncia de forma confiable, y el criterio 10 pide «foco en el error o el aviso».
  `RecuperarPage` lo resuelve bien (`tabIndex={-1}` y foco en un efecto). Es la tercera vez en el proyecto (sin-vincular y cierre-inactividad).
  Arreglo: `tabIndex={-1}` y foco al montar, con un test `toHaveFocus()` en `LoginPage.test.tsx`.

## Criterios de aceptación
| # | Implementado | Test |
|---|---|---|
| 1 | Sí (`LoginPage.tsx:111-115`) | `LoginPage.test.tsx` «ofrece "¿Olvidaste tu contraseña?"». La inversión del test viejo tiene sentido: la parte de «Recordarme» se conserva |
| 2 | Sí con 429; **no** con errores del servidor (problema 1) | `consultas.test.ts` y `RecuperarPage.test.tsx` |
| 3 | Sí | `RecuperarPage.test.tsx` «correo mal formado» (sin llamada y con `aria-describedby`) |
| 4 | Sí: la página no llama a nada al abrir; la plantilla lleva `token_hash` a la pantalla propia | «con token_hash muestra el formulario y no llama a Supabase» |
| 5 | Sí (8 caracteres, 72 bytes con `TextEncoder`, confirmación) | `esquema.test.ts` y la página (ids y `aria-describedby`) |
| 6 | Orden y reintento sin re-verificar: sí. Enlace al login tras `same_password`: no lleva al login (problema 2) | orden en `consultas.test.ts`; reintento en el hook y en la página |
| 7 | Lo hace el servidor (GoTrue revoca las sesiones al cambiar la contraseña) | Sin test en este diff: le queda al e2e del qa (`refreshSession` con el refresh token viejo) |
| 8 | Sí: vencido, usado, sin `token_hash`, vacío y `user_banned` → `enlace-invalido` | consultas (`otp_expired`, `user_banned`) y página |
| 9 | Sí: no hay `updateUser`, se cierra la sesión y se muestra el mensaje | `consultas.test.ts` y página |
| 10 | Labels, `aria-describedby` y foco en las alertas de `NuevaContrasena` y `Recuperar`: sí. Falta el foco del aviso del login (problema 3) | tests de a11y de cada página |

## Otros puntos verificados (sin problema)
- El orden es `verifyOtp` → `esAdmin` → `updateUser` → `cerrarSesion`, y se navega recién después del `await` (test con la promesa pendiente).
- `cerrarSesion` y `AuthContext.tsx` no cambiaron: el diff de `consultas.ts` solo agrega código.
- `token_hash` no se loguea ni se manda a otro lado. Tras el éxito, `navigate(..., { replace: true })` saca la URL con el token del historial.
- Con la cuenta sin marca, el listener y `restablecerContrasena` llaman a `signOut` a la vez. El segundo no encuentra sesión y vuelve sin error, así que no se dispara la recarga de #46.
- Las páginas no llaman a `consultas`. `NuevaContrasenaPage` importa solo el tipo `ResultadoRestablecer`, lo que cumple `rules/react.md`.
- `config.toml`: `minimum_password_length = 8`, la plantilla con `content_path` relativo a la raíz (como el ejemplo de la CLI), `email_sent = 100` y sin `redirectTo`
  ni `additional_redirect_urls`. La plantilla está en español y no tiene `{{ .ConfirmationURL }}`.
- Seed: `supabaseLocal()` exige una API local. Es idempotente (`email_exists` → «ya existía»). `db:reset` sembró los tres usuarios.
- Sin secretos ni migraciones, y nada fuera del alcance. `.claude/agent-memory/critico/*` es memoria del crítico.

## Evidencia
- `npm run lint`: 0 errores y 4 warnings previos (`DescargaModal`, `TallerFormPage`, `AuthContext:71`, `ConfiguracionPage`), ninguno en archivos de este cambio.
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 95 archivos y 1602 tests pasan.
- `npm run db:reset`: aplicado. `admin@dam.local`, `sin-permiso@dam.local` y `recuperacion@dam.local` creados.
