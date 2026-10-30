# Crítica de la spec: recuperación de contraseña (#21)

Revisé la spec, `contexto.md`, `AuthContext.tsx`, `consultas.ts`, `supabase.ts`, `LoginPage.tsx`, `AdminLayout.tsx`, `router.tsx`,
`config.toml`, `e2e/helpers.ts`, `playwright.config.ts` y el código de auth-js 2.117.3 (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`).
Los ADR que leí son 0005 y 0014. El flujo implicit y el cierre global salen de la entrevista, no de un ADR, así que no reabro ninguna decisión aceptada.

## Veredicto
Hay mejoras

Si solo se cambia una cosa: que el correo lleve `token_hash` a `/admin/nueva-contrasena` y que la página llame a `verifyOtp` al enviar el formulario, en lugar del flujo implicit con la sesión en el hash.

## Puntos

1. **El flujo implicit crea una sesión de admin antes de que se fije la contraseña, y hay que protegerla en varios frentes (puntos 2 a 5)** (alta)
   — Evidencia: spec.md:24, spec.md:29, `GoTrueClient.js:383-431` (`_initialize` guarda la sesión del hash) y `config.toml:165` (`redirectTo`).
   — Alternativa: armar el enlace de la plantilla `recuperacion.html` con el token:
   `{{ .SiteURL }}/admin/nueva-contrasena?token_hash={{ .TokenHash }}`. `NuevaContrasenaPage` lee `token_hash` de la query. Si no está, muestra el `role="alert"`
   del criterio 8. Al enviar un formulario válido según zod, llama primero a `verifyOtp({ token_hash, type: 'recovery' })` (`GoTrueClient.js:2041-2069`), después a
   `updateUser({ password })` y por último a `cerrarSesion()`, y navega al login con el aviso. Todo eso entra en una función de `AuthContext` o en un hook de mutación,
   no en una llamada a `consultas` desde la página (`.claude/rules/react.md`). Dos detalles que hay que dejar escritos para que no fallen:
   (a) si `verifyOtp` sale bien y `updateUser` falla (`same_password`, red), el reintento **no** vuelve a verificar, porque el token ya se consumió y daría
   `otp_expired`. La página guarda que ya verificó (un ref) y en el reintento solo llama a `updateUser`.
   (b) se navega al login después de `await cerrarSesion()`. Si se navega antes, `LoginPage.tsx:40-42` ve el `usuario` que dejó `PASSWORD_RECOVERY` y redirige a `/admin`.
   — Qué se gana:
   - No hay sesión hasta que la persona envía el formulario. `AuthContext` no cambia: se borran `enRecuperacion` y la regla de la caché del criterio 5.
   - Desaparecen los bugs de los puntos 2 a 5 (orden de eventos, recarga, pestañas y tokens en el historial).
   - Funciona en cualquier pestaña o navegador sin verificador PKCE, así que el argumento de spec.md:29 se cumple igual.
   - El token es de un solo uso y no es una sesión: si queda en el historial, no expone más que el correo mismo.
   - Ya no hacen falta `redirectTo` ni `additional_redirect_urls`, y el checklist de la nube queda en `site_url`, la plantilla y SMTP.
   - Los antivirus de correo que abren los enlaces antes que la persona (Safe Links y similares, habituales en correo oficial) ya no consumen el token. Con
     `{{ .ConfirmationURL }}`, el GET a `/auth/v1/verify` lo gasta y la persona ve «enlace vencido» al primer clic.
   - El costo: un enlace vencido se descubre al enviar y no al abrir. Es aceptable, porque el error del criterio 8 se muestra igual y se ofrece pedir otro.

2. **Implicit, bug 1: `INITIAL_SESSION` llega antes que `PASSWORD_RECOVERY`, y este último se puede perder** (alta, solo si se mantiene implicit)
   — Evidencia: `GoTrueClient.js:421-429` emite `PASSWORD_RECOVERY` en un `setTimeout(0)` después de guardar la sesión. `onAuthStateChange` (`:3645-3654`)
   emite `INITIAL_SESSION` con esa misma sesión apenas se resuelve `initializePromise`, en microtareas, o sea antes. `AuthContext.tsx:41` pone `cargando = false`
   en `INITIAL_SESSION`.
   — Lo que falla:
   - Hay un render con `usuario` = admin, y la página ve «sin sesión de recuperación» y anuncia el `role="alert"` del criterio 8 antes de corregirse.
   - Con `usuario` asignado y después anulado, `AuthContext.tsx:44-46` limpia la caché, en contra del criterio 5.
   - El cliente se inicializa al importar `supabase.ts`, pero el listener se suscribe en un `useEffect`. Si `_getUser` (`:3320`) responde antes de que React monte,
     el `setTimeout` se dispara sin suscriptores y `PASSWORD_RECOVERY` no llega nunca.
   — Alternativa: el punto 1. Si se mantiene implicit, `enRecuperacion` tiene que salir de la sesión misma, no del evento. El claim `amr` del access token trae
   `method: 'recovery'`, y eso hay que comprobarlo en local antes de apoyarse en él. Con eso, `usuario = esAdmin(user) && !esRecuperacion(session)` queda como
   función pura junto a `esAdmin.ts`.

3. **Implicit, bug 2: al recargar o al escribir `/admin` en la barra, se entra al panel sin haber cambiado la contraseña** (alta, solo si se mantiene implicit)
   — Evidencia: spec.md:15 (criterio 5) y spec.md:24. `supabase.ts:141` guarda la sesión en `sessionStorage`. `enRecuperacion` sería estado de React, que se pierde
   con cualquier carga completa. Después de recargar, `INITIAL_SESSION` trae una sesión de admin sin nada que la distinga, y `AdminLayout.tsx:48` deja pasar.
   La recuperación tampoco tiene salida: `/admin/nueva-contrasena` diría «enlace vencido» con la sesión todavía válida.
   — Alternativa: el punto 1, o el `amr` del punto 2. Un flag en `sessionStorage` también serviría, pero suma otro estado que hay que limpiar en `SIGNED_OUT` y
   `USER_UPDATED` (auth-js lo emite después del `updateUser`, `:2887`).
   — Nota: no es una escalada de privilegios. Quien tiene el enlace puede fijar la contraseña y entrar igual. Lo que no se cumple es el criterio 5, que la
   verificación de punta a punta (paso 2) no detecta si no se recarga.

4. **Implicit, bug 3: `PASSWORD_RECOVERY` se reenvía a las otras pestañas y saca del panel a la que estaba abierta** (media, solo si se mantiene implicit)
   — Evidencia: `GoTrueClient.js:267-288`. El `BroadcastChannel` usa el `storageKey` (`CLAVE_SESION`) y entrega a los listeners de las otras pestañas los eventos de esta,
   sin tocar su storage.
   — Lo que falla: el admin tiene el panel abierto en una pestaña y abre el enlace en otra. La primera recibe `PASSWORD_RECOVERY`, pone `enRecuperacion` y anula `usuario`,
   así que `AdminLayout` la manda al login aunque su propia sesión sigue en su `sessionStorage`. Con el punto 1, la otra pestaña recibe la misma sesión del mismo id
   y `AuthContext.tsx:44` no ve ningún cambio.
   — Alternativa: el punto 1. Si se mantiene implicit, el listener tiene que ignorar los eventos de recuperación que no salen de la pestaña propia, y auth-js no
   expone ese dato.

5. **Implicit, bug 4: el `refresh_token` queda en el historial de la pestaña** (media, solo si se mantiene implicit)
   — Evidencia: `GoTrueClient.js:3334` limpia con `window.location.hash = ''`. Esa asignación **agrega** una entrada al historial, no reemplaza la actual:
   «Atrás» vuelve a `/admin/nueva-contrasena#access_token=…&refresh_token=…&type=recovery`.
   — Lo que falla: si la persona abandona sin cambiar la contraseña, cualquiera con acceso al navegador puede sacar del historial un refresh token válido de
   admin, que no vence solo. `history.replaceState` posterior no borra la entrada anterior.
   — Alternativa: el punto 1. `token_hash` es de un solo uso y vence en `otp_expiry` (`config.toml:238`, 1 h).

6. **«Extender `cerrarSesion` con `scope`» no cambia nada** (media)
   — Evidencia: spec.md:23. `signOut(options = { scope: 'global' })` ya es global por defecto (`GoTrueClient.js:3414`), y `cerrarSesion` (`consultas.ts:90-93`)
   lo llama sin opciones. Además, GoTrue revoca las otras sesiones del usuario al cambiar la contraseña con `updateUser` (`LogoutAllExceptMe`). Para confirmarlo en
   local alcanza con mirar `auth.sessions` antes y después.
   — Alternativa: no tocar `cerrarSesion` ni su fallback de #46 y llamarlo tal cual después del `updateUser`.
   — Qué se gana: no se reabre una función con un caso borde delicado. En este flujo el fallback de #46 no recarga: el token recién emitido está vigente, y
   `_signOut` (`:3437-3446`) borra la sesión local aunque falle la red, así que `CLAVE_SESION` ya no está y `consultas.ts:101` vuelve sin recargar. El aviso
   «Contraseña actualizada» del `location.state` sobrevive.

7. **El criterio 7 («se cierran todas las sesiones») no se puede verificar tal como está escrito** (media)
   — Evidencia: spec.md:17 y `config.toml:167` (`jwt_expiry = 3600`). Revocar solo invalida los refresh tokens. En otro dispositivo, el access token vigente sigue
   pasando la RLS hasta 1 h. En otra pestaña del mismo navegador, el `SIGNED_OUT` reenviado (punto 4) muestra el login, pero el `sessionStorage` de esa pestaña
   conserva la sesión: al recargar vuelve a entrar mientras el access token no venza.
   — Alternativa: reescribir el criterio así: «las otras sesiones dejan de poder renovarse; su access token vigente vence en ≤ 1 h». Para verificarlo: un e2e con dos
   contextos de Playwright, o un `refreshSession` con el refresh token viejo que tiene que fallar.
   — Qué se gana: un criterio que el qa puede probar, y sin la promesa implícita de un cierre inmediato que Supabase no da.

8. **El mensaje de exceso de envíos revela si la cuenta existe, y eso contradice el criterio 2** (media)
   — Evidencia: spec.md:12-13. Para un correo inexistente, GoTrue responde 200 sin enviar nada, y entonces no consume `email_sent` (`config.toml:202`) ni choca con
   `max_frequency` (`config.toml:234`, por usuario). El 429 `over_email_send_rate_limit` solo puede salir para una cuenta real. Pedir dos veces seguidas el mismo
   correo alcanza para distinguir.
   — Alternativa: tratar el 429 como un éxito y mostrar el mismo aviso neutro, con una línea más («Si no llega en unos minutos, revisá spam o volvé a pedirlo más
   tarde»). Solo el error de red tiene un mensaje propio. La diferencia de tiempos (con una cuenta real GoTrue manda el correo antes de responder) no se puede
   tapar desde el cliente. Hay que dejarla aceptada en la spec: el padrón de admins es chico y los correos son institucionales.
   — Qué se gana: el criterio 2 se cumple de verdad, y hay una rama y un mensaje menos.

9. **El criterio 9 («una cuenta sin la marca puede cambiarla») choca con el listener y amplía el alcance** (media)
   — Evidencia: spec.md:19 y `AuthContext.tsx:36-40`. El listener cierra con `setTimeout(0)` toda sesión sin la marca. Con cualquiera de los dos flujos, ese
   `signOut` compite con el `updateUser`, y para cumplir el criterio habría que poner una excepción en el listener.
   Según 0005:25, una cuenta se desactiva con ban y no quitándole la marca: la única cuenta sin marca es `sin-permiso@dam.local`, del seed.
   — Alternativa: si después de `verifyOtp` `esAdmin(data.user)` es falso, no llamar a `updateUser`, cerrar la sesión y mostrar el mismo
   «Tu cuenta no tiene permisos de administrador» de `LoginPage.tsx:22`. Una cuenta baneada (`user_banned` en `verifyOtp`) recibe el mensaje de enlace inválido.
   Reescribir el criterio 9 con esas dos salidas.
   — Qué se gana: el listener no cambia, y no se mantiene un camino para cuentas que no pueden usar nada.

10. **El e2e puede ser más simple y menos frágil** (media)
    — Evidencia: spec.md:30 y `e2e/helpers.ts:4`. Crear un usuario por corrida con la Admin API exige que Playwright consiga la clave de servicio
    (`scripts/lib/supabaseLocal.ts`, `npx supabase status`) y deja usuarios acumulados hasta el próximo `db:reset`.
    — Alternativa:
    - Sembrar un usuario dedicado en `scripts/seed-usuarios.mjs` (por ejemplo `recuperacion@dam.local`, con la marca). Cada corrida fija una contraseña aleatoria
      nueva y entra con ella, así que no depende de la contraseña que dejó la corrida anterior y `admin@dam.local` queda intacto.
    - Mailpit conserva los correos de corridas anteriores. Hay que buscar el último que llegó a ese destinatario (`GET /api/v1/search?query=to:...` y tomar el
      primero) dentro de un `expect.poll`, o borrar los mensajes al empezar (`DELETE /api/v1/messages`).
    - El e2e no debe pedir dos correos para la misma cuenta en menos de `max_frequency` (1 s): daría 429.
    - Antes de subir `email_sent`, conviene comprobar si el entorno local lo aplica. El comentario de `config.toml:201` dice que requiere SMTP, y Mailpit cuenta como
      SMTP local. Sea como sea, subirlo en local no hace daño.
    — Qué se gana: Playwright no necesita la clave de servicio, no hay limpieza de usuarios y no hay correos viejos que confundan la prueba.

11. **Algunos criterios no se pueden provocar en local, y la spec no dice cómo se verifican** (baja)
    — Evidencia: spec.md:13 y spec.md:16.
    - `weak_password` no puede salir. Con `password_requirements = ""` y el mínimo de `config.toml:185` igual al de zod, el formulario lo frena antes (la
      verificación de contraseñas filtradas es solo de la nube paga).
    - El 429 deja de ocurrir si se sube `email_sent`.
    — Alternativa: aclarar que esas ramas se prueban con un test unitario de `NuevaContrasenaPage` / `RecuperarPage` con el error mockeado, no en el e2e ni en la
    verificación manual.

12. **El máximo de 72 se cuenta en bytes, no en caracteres** (baja)
    — Evidencia: spec.md:16 y spec.md:25. El límite de bcrypt en GoTrue es de 72 **bytes**, y `z.string().max(72)` cuenta unidades UTF-16. Una contraseña de 40 caracteres
    con «ñ» o tildes pasa zod y la rechaza el servidor con un error sin traducir.
    — Alternativa: `.refine((p) => new TextEncoder().encode(p).length <= 72, 'Usá como máximo 72 caracteres (menos si tiene tildes o ñ)')`.

13. **`same_password` después de una respuesta que se perdió** (baja)
    — Evidencia: spec.md:16. Puede pasar que `updateUser` guarde la contraseña y que la respuesta no llegue por la red. Entonces el reintento con la misma
    contraseña recibe `same_password` («igual a la anterior»), y desconcierta.
    — Alternativa: redactar el mensaje así: «Esa ya es tu contraseña actual: ingresá con ella o elegí otra», con un enlace al login.
    — Qué se gana: el mismo texto cubre los dos casos, sin una rama más.

14. **La regla de caché del criterio 5 no hace falta** (baja)
    — Evidencia: spec.md:15 («la caché de React Query no se limpia (0014)»). Las dos pantallas están fuera de `AdminLayout` y no leen datos que dependan del rol.
    Si la caché se vacía al entrar y al salir la sesión, no se nota.
    — Alternativa: quitar esa cláusula. Si se adopta el punto 1, `AuthContext.tsx:44-46` sigue igual.

15. **Los cambios en la configuración de auth no se aplican con `db:reset`** (baja)
    — Evidencia: spec.md:28 y spec.md:37. La plantilla, `minimum_password_length` y los límites viven en el contenedor de auth, que lee `config.toml` al arrancar.
    Hay que verificar si `db:reset` lo reinicia. Si no lo hace, el paso 1 muestra el correo en inglés y el mínimo viejo.
    — Alternativa: en la verificación y en el PR, poner «`npm run db:stop` + `npm run db:start`» (o el comando que lo reinicie). Avisarle a la otra persona, que
    también tiene que reiniciar después del pull.

16. **El botón de ver u ocultar la contraseña se copiaría** (baja)
    — Evidencia: `LoginPage.tsx:85-104`. Si `NuevaContrasenaPage` también lo lleva, en los dos campos, quedan tres copias.
    — Alternativa: extraer `InputPassword` a `src/shared/components/ui/` y usarlo en las dos páginas. Otra opción es no ponerlo en la pantalla nueva.

## Respuesta

El crítico verificó el comportamiento de auth-js en el código de la versión instalada; lo que dice de GoTrue (servidor) está marcado «comprobar en local» y lo comprueban el implementador y el qa.

| # | Sev. | Respuesta | Motivo |
|---|---|---|---|
| 1 | alta | **Acepto, pero cambia una decisión de la entrevista: lo decide el usuario.** | La entrevista ofrecía implicit o PKCE; `token_hash` + `verifyOtp` no estaba entre las opciones y resuelve los puntos 2 a 5 de raíz. Recomiendo adoptarlo. |
| 2-5 | alta/media | Acepto como consecuencia del 1; quedan sin objeto si se adopta. | Con `verifyOtp` al enviar no hay sesión antes del formulario: ni carrera de eventos, ni recarga, ni difusión entre pestañas, ni token en el historial. |
| 6 | media | Acepto. | `signOut` ya es global y GoTrue revoca las otras sesiones al cambiar la contraseña. No se toca `cerrarSesion` ni el fallback de #46. |
| 7 | media | Acepto. | El criterio 7 se reescribe: «las otras sesiones dejan de poder renovarse». |
| 8 | media | Acepto. | El 429 se muestra con el aviso neutro; solo la red tiene mensaje propio. La diferencia de tiempos se documenta como aceptada. |
| 9 | media | Acepto. | Tras `verifyOtp`, sin la marca admin no se actualiza, se cierra la sesión y se muestra «sin permisos». Cuenta baneada: mensaje de enlace inválido. Sin excepción en el listener. |
| 10 | media | Acepto. | Usuario dedicado sembrado en `seed-usuarios.mjs` (toca un archivo fuera de `features/auth`: lo aviso al usuario), contraseña aleatoria por corrida, búsqueda del último correo con `expect.poll`. |
| 11 | baja | Acepto. | `weak_password` y el 429 se prueban con test unitario y error mockeado. |
| 12 | baja | Acepto. | `refine` con `TextEncoder` (límite de 72 **bytes**). |
| 13 | baja | Acepto. | Un solo mensaje para `same_password`, con enlace al login. |
| 14 | baja | Acepto. | Se quita la cláusula de la caché del criterio 5. |
| 15 | baja | Acepto. | El implementador comprueba si `db:reset` reinicia auth; si no, se documenta `db:stop` + `db:start` en el PR. |
| 16 | baja | Acepto con una consulta al usuario. | Extraer `InputPassword` a `shared/components/ui/` toca `LoginPage` (que ya se modifica) y se justifica por la regla de reutilizar antes de copiar. |

**Desacuerdos para mostrar al usuario:** ninguno de fondo con el crítico. Pendientes de decisión del usuario: el cambio de flujo (1), tocar el seed (10) y extraer `InputPassword` (16).

# Crítica del código

Pedida como `critica-codigo.md`. El perfil del crítico solo puede escribir `critica.md`, así que la crítica va en esta sección.
Revisé `consultas.ts`, `esquema.ts`, los dos hooks, `RecuperarPage`, `NuevaContrasenaPage`, `LoginPage`, `InputPassword`, `router.tsx`, `config.toml`,
la plantilla, el seed y `AuthContext.tsx`, más `GoTrueClient.js` y `lib/fetch.js` de auth-js. No repito lo que ya resolvió la crítica de la spec.

## Veredicto
Hay mejoras

Si solo se cambia una cosa: partir `restablecerContrasena` en `verificarEnlace` y `cambiarContrasena`, y que el hook decida el reintento con un solo ref, sin `yaVerificado` ni `TOKEN_CONSUMIDO`.

## Puntos

1. **Después de `same_password`, «Ir a ingresar» lleva al panel sin pedir contraseña** (media)
   — Evidencia: `verifyOtp` emite `PASSWORD_RECOVERY` con la sesión (`GoTrueClient.js:2067`), y `AuthContext.tsx:33-36` la toma como admin. Cuando `updateUser`
   falla, la sesión sigue abierta a propósito (`consultas.ts:89-98`). El enlace de `NuevaContrasenaPage.tsx:30` lleva a `/admin/login`, y `LoginPage.tsx:39-41`, al ver
   `usuario`, redirige a `/admin`. El mensaje dice «ingresá con ella», pero la persona entra directo, sin escribir nada. Lo mismo pasa si después de `red` escribe `/admin`.
   No hay escalada (quien tiene el enlace podía fijar la contraseña igual), pero la pantalla dice una cosa y la app hace otra, y la sesión de recuperación queda viva en la pestaña.
   — Sobre el cierre al desmontar: no conviene. El cleanup corre cuando `LoginPage` ya se renderizó con `usuario` asignado, y el `signOut` es asíncrono. Por eso hay un
   `Navigate` a `/admin` y un rebote al login sin el `state`, o sea un parpadeo y un aviso perdido. Además, `main.tsx` usa `StrictMode`, que corre los cleanups de más en desarrollo.
   — Alternativa: cerrar al hacer clic. El enlace de `misma-contrasena` pasa a ser un componente chico dentro de la página, que llama a `await useAuth().cerrarSesion()`
   (ya lo expone el contexto) y después a `navigate('/admin/login')`. Si la persona cierra la pestaña o escribe la URL a mano, se acepta y se deja escrito en la spec:
   la sesión vive en el `sessionStorage` de esa pestaña. Otra opción, que cambia el criterio 6: cerrar la sesión en `consultas` ante `same_password` y quitar
   «o elegí otra», porque para elegir otra se pide un enlace nuevo. Así el reintento queda solo para `red`.
   — Qué se gana: el texto y el comportamiento coinciden, y la sesión que abrió `verifyOtp` se cierra en todos los caminos que la app controla.

2. **`restablecerContrasena(tokenHash, password, yaVerificado)` y `TOKEN_CONSUMIDO` reparten el mismo conocimiento en dos archivos** (media)
   — Evidencia: `consultas.ts:67-102` decide qué códigos salen después de verificar. `useRestablecerContrasena.ts:6-10` vuelve a listarlos para saber cuándo poner el
   ref. Si mañana `updateUser` devuelve un código nuevo (por ejemplo, sesión vencida) y no se suma al `Set`, el reintento vuelve a verificar, recibe `otp_expired` y muestra
   «el enlace venció» con una sesión válida. Encima hay dos capas de `try/catch`: `consultas` «nunca rechaza» y el hook igual atrapa y deriva `red` o
   `red-verificacion` del ref (`:23-27`). Lo mismo pasa en `useSolicitarRecuperacion.ts:8-12`.
   — Alternativa: dos funciones en `consultas.ts`:
   `verificarEnlace(tokenHash): 'ok' | 'enlace-invalido' | 'sin-permiso' | 'reintentar'` y
   `cambiarContrasena(password): 'ok' | 'misma-contrasena' | 'contrasena-debil' | 'reintentar'` (esta cierra la sesión si sale bien). El hook queda así:
   `if (!verificado.current) { const v = await verificarEnlace(t); if (v !== 'ok') return v; verificado.current = true } return cambiarContrasena(p)`.
   El ref se pone en un solo lugar y por el hecho mismo («verifyOtp salió bien»), no por una lista de códigos. Se van el tercer parámetro, el `Set` y el `catch` del hook,
   que tampoco hace falta en `useSolicitarRecuperacion` porque `pedirRecuperacion` ya atrapa. `red` y `red-verificacion` se pueden juntar en un solo `reintentar` (ver el punto 3):
   la acción de la persona es la misma.
   — Qué se gana: seis resultados en lugar de siete, cada función con un solo `try`, y el invariante «no se verifica dos veces» queda explícito en tres líneas.

3. **Lo desconocido se muestra como «venció» o como «revisá tu conexión», y las dos cosas pueden ser falsas** (media)
   — Evidencia:
   - `consultas.ts:78`: todo error de `verifyOtp` que no sea `AuthRetryableFetchError` va a `enlace-invalido`. Un 429 `over_request_rate_limit`
     (`token_verifications = 30` cada 5 min por IP, `config.toml:213`, posible detrás del NAT de un edificio) dice «el enlace venció o ya se usó» con el token todavía sin usar.
   - Un 5xx sí llega como `AuthRetryableFetchError` (`fetch.js:22-44`), pero el mensaje culpa a la conexión.
   - `consultas.ts:55` y `:94`, más `NuevaContrasenaPage.tsx:36` y `RecuperarPage.tsx:64`: todo error desconocido dice «Revisá tu conexión». El fallo más probable en la
     nube es el SMTP: un 500 al enviar, o `email_address_not_authorized` con el SMTP por defecto de Supabase. El admin va a revisar su red, y el problema es la configuración.
   — Alternativa: invertir la lista. Van a `enlace-invalido` solo `otp_expired` y `user_banned`, que es lo que GoTrue devuelve para un enlace vencido, usado,
   inexistente o de una cuenta baneada. Todo lo demás va a `reintentar`, con un texto que sea cierto en las dos fases: «No se pudo completar. Intentá de nuevo en unos minutos;
   si sigue fallando, pedí otro enlace», con el enlace. En `RecuperarPage`, «No se pudo enviar el enlace. Intentá de nuevo en unos minutos». Así también desaparece
   `esErrorDeRed`. Si se conserva, `isAuthRetryableFetchError` ya viene exportado por `@supabase/supabase-js`, y `status === 0` sobra porque solo lo produce esa clase.
   — Qué se gana: ningún mensaje afirma una causa que el código no sabe, y la salida («pedí otro enlace») funciona en todos los casos.

4. **La tarjeta de las pantallas de auth está tres veces, y la cuarta llega con #34** (baja)
   — Evidencia: `LoginPage.tsx:49-56`, `RecuperarPage.tsx:34-44` y `NuevaContrasenaPage.tsx:43-57`: el mismo fondo, la misma tarjeta, el logo `.se` y el `h1`. Las clases de los
   avisos (verde `status`, rojo `alert` con foco) también se repiten en `LoginPage.tsx:58-71`, `RecuperarPage.tsx:47-65` y `NuevaContrasenaPage.tsx:59-60`. El texto
   «Tu cuenta no tiene permisos de administrador» está en `LoginPage.tsx:22` y en `NuevaContrasenaPage.tsx:26`.
   — Alternativa: `features/auth/components/PantallaAuth.tsx` (`{ titulo, descripcion?, children }`), que reemplaza `Tarjeta` y los dos bloques copiados, y un
   `MENSAJE_SIN_PERMISO` exportado desde `features/auth`. Un componente `Aviso` en `ui/` solo si lo pide otro dominio.
   — Qué se gana: unas 30 líneas menos, y la invitación por correo (#34) reutiliza la pantalla sin hacer una cuarta copia.

5. **Falta `token_hash`: es una rama aparte que repite el mensaje de `enlace-invalido`** (baja)
   — Evidencia: `NuevaContrasenaPage.tsx:91-102` contra `:18-25`. El criterio 8 agrupa «ausente» con «vencido o usado».
   — Alternativa: `const falloVisible = tokenHash ? fallo : 'enlace-invalido'`, con un texto como «El enlace no es válido, venció o ya se usó». Se borra el
   `return` temprano, y el foco al montar sale del mismo `useEffect`.
   — Qué se gana: un solo mensaje y un solo enlace a «Pedir otro», sin una rama más que testear.

6. **El `motivo` del login es un contrato sin tipo** (baja)
   — Evidencia: `LoginPage.tsx:29-31` lo tipa con un cast, y `NuevaContrasenaPage.tsx:85` y `AdminLayout` mandan el texto suelto. Si hay una errata en el `state`, el aviso
   no se ve y el typecheck no lo detecta.
   — Alternativa: exportar `type MotivoLogin = 'inactividad' | 'contrasena-actualizada'` desde `features/auth` y usar `satisfies { motivo: MotivoLogin }` en los
   dos `navigate`.

**Está bien así:**
- `config.toml`: `email_sent = 100` solo vale en local y está comentado, `minimum_password_length = 8` coincide con el zod, y la plantilla con `token_hash` hace que el
  desfase entre `site_url` (`localhost`) y `127.0.0.1` no importe. El `&type=recovery` de la plantilla no se lee, porque la página fija `type: 'recovery'`. Es inofensivo.
- El seed con contraseña fija: el e2e la reemplaza y el seed es idempotente, así que no la restaura. El comentario ya lo dice.
- `InputPassword`: es la extracción mínima, sin opciones de más.

## Respuesta al código (crítico + revisor)

El revisor dio «cambios necesarios» (3 importantes). Sus problemas 2 y 3 coinciden con los puntos 1 y 3 del crítico; el problema 1 del revisor y el punto 3 del crítico chocan en `RecuperarPage` y gana el revisor (ver 3).

| Origen | Sev. | Respuesta | Motivo |
|---|---|---|---|
| Revisor 1 | importante | **Acepto.** | `pedirRecuperacion` devuelve `'red'` solo si la llamada lanza o el error es `status === 0` (sin respuesta del servidor); cualquier otro error, incluidos 4xx y 5xx, devuelve `'ok'`. Un 500 por SMTP sale solo para cuentas reales y revelaría cuáles existen. Tests con un 400 y un 500 que esperan `'ok'`. |
| Revisor 2 / Crítico 1 | importante / media | **Acepto parcialmente.** | El enlace a «ingresar» de `misma-contrasena` cierra la sesión (`cerrarSesion`) y recién después navega al login; con test. Cerrar al desmontar se descarta (carrera con `LoginPage` y `StrictMode`). **Queda aceptado y escrito en la spec:** si la persona abandona o recarga tras un fallo, la sesión de recuperación vive en el `sessionStorage` de esa pestaña. Quien tiene el enlace ya podía fijar la contraseña, así que no hay escalada. Se propone un issue aparte. |
| Revisor 3 | importante | **Acepto.** | El aviso «Contraseña actualizada» del login recibe foco como en `RecuperarPage` (`tabIndex={-1}` + efecto), con test `toHaveFocus()`. |
| Crítico 2 | media | **Acepto.** | `restablecerContrasena` se parte en `verificarEnlace(tokenHash)` y `cambiarContrasena(password)`; el hook decide el reintento con un solo ref; `red` y `red-verificacion` se juntan en `reintentar`. Se van el tercer parámetro, el `Set` y los `catch` redundantes. Cambia la firma que fijaron los tests: el implementador los adapta sin cambiar qué se verifica. |
| Crítico 3 | media | **Acepto para verificar y guardar; no para pedir el correo.** | Solo `otp_expired` y `user_banned` van a `enlace-invalido`; todo lo demás a `reintentar`, con un texto que no afirma una causa («No se pudo completar. Intentá de nuevo en unos minutos; si sigue fallando, pedí otro enlace»). En `RecuperarPage` rige el Revisor 1 (no distinguir). |
| Crítico 5 | baja | Acepto (trivial). | `const falloVisible = tokenHash ? fallo : 'enlace-invalido'`; se borra el `return` temprano. |
| Crítico 4 | baja | **Rechazo por ahora → `notas.md`.** | `PantallaAuth` agrega un componente nuevo; conviene con #34, cuando haya una cuarta pantalla. |
| Crítico 6 | baja | **Rechazo por ahora → `notas.md`.** | Tipar `MotivoLogin` toca `AdminLayout`, fuera del corte. |

**Para el usuario:** (a) abrir un issue por la sesión de recuperación que queda tras un fallo si se abandona la pantalla; (b) agregar a `.claude/rules/react.md` la regla «un `role="status"` montado con su texto no se anuncia: enfocarlo» (tercera vez que aparece, según el revisor).
