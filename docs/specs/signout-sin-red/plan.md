# Plan: cierre de sesión que falla sin red (#46)

**Objetivo:** si `signOut()` devuelve error, la sesión del admin se descarta igual: se borra de `sessionStorage` y se recarga la página en `/admin/login`. El panel no queda abierto ni la sesión revive al volver la red.

**Por qué:** con el access token vencido y sin red, `signOut()` no puede refrescarlo, devuelve el error y no borra nada (`GoTrueClient._signOut`, `_useSession`). `scope: 'local'` pasa por el mismo camino, así que no sirve. La carga completa descarta el cliente de memoria, que es lo único que podría refrescar la sesión.

**Rama:** `fix/signout-sin-red`, salida de `feat/cierre-inactividad` (#45 sin mergear toca `AdminLayout` y `AuthContext`). Si #45 se mergea antes, rebase sobre `main`.

**Archivos:** `src/features/auth/consultas.ts` (+ test), `src/features/auth/AuthContext.tsx` (+ test), `src/shared/components/layout/AdminLayout.tsx` (comentario), `src/shared/lib/supabase.ts` si hace falta una `storageKey` explícita.

**Pasos (test primero):**
1. `consultas.cerrarSesion`: si `supabase.auth.signOut()` devuelve `error` o lanza, borra la clave de sesión de `sessionStorage` y navega con carga completa a `/admin/login` (`window.location.assign`). Si el cierre sale bien, no hace nada de eso.
2. La clave: preferir una `storageKey` explícita en `createClient` y exportarla como constante, para no adivinar el nombre derivado de la URL. Verificar que el cambio no desloguee a nadie de forma inesperada (la sesión es por pestaña).
3. Tests: `signOut` con error borra la clave y recarga; con éxito no recarga; que lance también cuenta. Un test del flujo de `AdminLayout` al vencer con `signOut` fallando.
4. Corregir los comentarios de `AdminLayout.tsx` y `AuthContext.tsx:38` (ya no es un caso abierto) y la brecha en `docs/arquitectura.md` si aplica.

**Fuera de alcance:** invalidar la sesión en el servidor, cambios de base de datos, el cierre por inactividad en sí (#22).

**Verificación:** `npx vitest run src/features/auth src/shared/components/layout`, `npm run lint`, `npm run typecheck`. Como toca la sesión y una redirección: `qa` en el navegador (token vencido y red caída con `context.setOffline(true)`), después `npm run test:e2e` y `npm run db:reset`.
