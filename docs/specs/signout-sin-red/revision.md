# Revisión 1

Alcance: cambios sin commitear de `fix/signout-sin-red` (la rama sale de `feat/cierre-inactividad`) contra `plan.md` (#46).
Archivos: `src/shared/lib/supabase.ts`, `src/features/auth/consultas.ts` (+ `consultas.test.ts`), `AuthContext.tsx`,
`AdminLayout.tsx`, `AdminLayout.signout.test.tsx`, `docs/arquitectura.md`. Librería contrastada: `@supabase/auth-js` 2.117.3.

## Veredicto
Cambios necesarios

## Problemas
- **[importante]** `src/features/auth/consultas.ts:22` — `{ error }` no siempre quiere decir "auth-js no borró la sesión". Con el access
  token **vigente** y sin red, `/logout` falla con `AuthRetryableFetchError`, que no es 401/403/404. En ese caso `_signOut` llama a
  `removeCurrentSession()` (emite `SIGNED_OUT`) **y después** devuelve el error (`GoTrueClient.js:3443-3449`). Hoy ese caso recarga igual:
  `window.location.assign('/admin/login')` sin red muestra la página de error del navegador, no el login. Se pierde además
  `state.motivo = 'inactividad'`, que el `<Navigate>` ya había llevado. Es el caso sin red más común: el token dura 1 h y el plazo de
  inactividad es de 30 min. Antes de este cambio funcionaba bien, así que es una regresión, y ningún test la cubre. Arreglo: después
  del fallo, `if (sessionStorage.getItem(CLAVE_SESION) === null) return` (auth-js ya la borró y avisó). Test en `consultas.test.ts`:
  un `signOut` que borra la clave y devuelve `{ error }` no llama a `assign`.
- **[menor]** `src/shared/components/layout/AdminSidebar.tsx:19` — el comentario "signOut borra la sesión local aunque falle la red" sigue
  diciendo lo contrario de lo que se arregla en #46. Arreglo: el mismo texto que en `AdminLayout.tsx:30`.

## Observaciones (no bloquean)
- **La recarga sin red no llega al login, ni con el token vencido.** El objetivo de seguridad se cumple: el panel desaparece y la
  sesión no revive. Pero la recarga muestra la página de error de Chromium, y el `qa` lo va a ver con `context.setOffline(true)`. Si no
  se acepta, hay una alternativa sin recarga que verifiqué en el código: borrar `CLAVE_SESION` y llamar otra vez a
  `supabase.auth.signOut({ scope: 'local' })`. Sin sesión en storage, `__loadSession` devuelve `session: null` sin error y `_signOut` no
  llama a `/logout`. Corre `_removeSession` (verifiers PKCE, `-user`, `SIGNED_OUT`) sin red, y el `<Navigate>` conserva el motivo.
- **Demora antes de limpiar.** Con el token vencido, `signOut()` puede esperar los reintentos de `_refreshAccessToken` (backoff de hasta
  30 s, `GoTrueClient.js:4030-4045`), salvo que esté activo el enfriamiento de 60 s de `lastRefreshFailure`. Mientras tanto el panel
  sigue visible. Ya pasaba antes del cambio; conviene que el `qa` lo mida.

## Respuestas a las preguntas del encargo
1. **Claves.** auth-js usa `storageKey`, `-code-verifier` (legacy), `-flows-code-verifier` y `-flow-<id>-code-verifier`
   (`helpers.js:303-340`), además de `-user`. `_removeSession` las borra todas (`GoTrueClient.js:4432-4436`). El fix borra solo las dos
   primeras. Igual alcanza: `flowType` es `'implicit'` por defecto (`supabase-js/dist/index.cjs:36`), así que no se escribe ningún
   verifier, y no hay `userStorage`. La única credencial es `CLAVE_SESION`.
2. **Bucles.** No hay ciclo. Cada vuelta borra la clave antes del `assign`. Después de recargar, `INITIAL_SESSION` llega con `null` y
   `AuthContext` no vuelve a llamar a `cerrarSesion`. Desde `/admin/login`, `assign` recarga una sola vez y la página queda sin sesión.
3. **Carrera con el auto refresh.** No hace falta `stopAutoRefresh()`. Tanto el tic como `__loadSession` leen la sesión de storage en
   cada vuelta (`GoTrueClient.js:2521`, `4653`), así que sin la clave no refrescan. Un refresh que ya estaba en curso lo descarta la
   guarda de `_callRefreshToken` (`storedAtStart` no nulo y `storedAfter` nulo, `4241-4263`). Queda un hueco teórico entre `4247` y
   `_saveSession`, porque el borrado manual no suma `_sessionRemovalEpoch`. Pero exige que el refresh salga bien (con red) justo cuando
   `signOut` falló sin red, y la recarga descarta el cliente de todos modos. Es despreciable.
4. **Cambio de `storageKey`.** Es aceptable. Cada pestaña abierta se desloguea una vez al cargar el bundle nuevo. La clave vieja
   (`sb-<ref>-auth-token`) queda en el `sessionStorage` de esa pestaña hasta que se cierre, con la misma exposición que tenía antes. No
   hay otra referencia a la clave derivada en `src/`, `e2e/` ni `scripts/`. Limpiarla es opcional.
5. **Tests.** Sin la implementación fallan: en `consultas.test.ts` los casos 2 y 3 (clave presente, sin `assign`, el 3 rechaza) y en
   `AdminLayout.signout.test.tsx` los casos 1 y 2. El caso "sale bien" es el negativo, y el de `consultas.test.ts` además verifica que
   no se toca la clave. `stubGlobal('location')` sin `unstubAllGlobals` no contamina: vitest aísla cada archivo, los dos archivos lo
   stubean en `beforeEach` y Memory Router no usa `window.location`. Falta el caso del primer problema.
6. **Consumidores.** El cierre normal no recarga (hay test en los dos archivos). `AdminSidebar`, `AdminLayout` y `AuthContext` siguen
   llamando a `cerrarSesion().catch(() => {})`, y la función ya no rechaza. `src/test/auth.tsx` la mockea con `mockResolvedValue`.
7. **Comentarios y docs.** `AuthContext.tsx:38`, `AdminLayout.tsx:30` y la fila `auth` de `docs/arquitectura.md` están bien, salvo que
   "si `signOut()` devuelve error ... auth-js no borró la sesión" es falso con el token vigente (primer problema). Falta corregir el de
   `AdminSidebar.tsx:19`.

Fuera de alcance: nada. El diff sin commitear toca solo los archivos del plan.

**Recomiendo `qa`** después del arreglo, con dos escenarios offline: token vigente (tiene que llegar al login con el aviso de
inactividad, sin recargar) y token vencido (ver qué muestra la recarga y cuánto tarda).

## Evidencia
- `npm run lint`: exit 0, 0 errores, 4 warnings previos (`only-export-components` en `AuthContext.tsx:71`, que ya existía, y tres
  `incompatible-library` de RHF).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 88 archivos, 1492 tests pasan.
