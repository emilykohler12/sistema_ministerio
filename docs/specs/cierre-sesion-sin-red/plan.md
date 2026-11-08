# Plan: indicador de cierre de sesión en curso (#48)

**Objetivo.** Que "Cerrar sesión" muestre "Cerrando sesión…" mientras `signOut()` no responde, para que con el token vencido y sin red (~26 s de reintentos de auth-js) el admin vea que algo pasa.

**Por qué solo esto.** La espera la causa el lock de auth-js (`_signOut` dentro de `_useSession` refresca el token vencido con backoff) y no se puede cortar sin perder la revocación en el servidor del caso con red. La página de error de la recarga sin red (punto 2 del issue) es inherente a recargar una SPA sin red: se acepta y se documenta.

**Archivos.**
- `src/shared/components/layout/AdminSidebar.tsx` (+ `AdminSidebar.test.tsx` nuevo, o el de `AdminLayout.test.tsx` si ya cubre el botón): estado local `cerrando`. Al hacer clic pasa a true y el botón muestra "Cerrando sesión…" con ícono girando (`motion-safe:animate-spin`). El botón no usa `disabled` (perdería el foco): usa `aria-disabled` e ignora clics repetidos. Un `role="status"` visualmente oculto anuncia "Cerrando sesión". Si `cerrarSesion()` rechaza, vuelve a false.
- `e2e/signout-sin-red.spec.ts`: en el caso de token vencido, comprobar que el texto "Cerrando sesión…" aparece tras el clic.
- `docs/arquitectura.md`: en `auth`, una frase con el límite aceptado (token vencido y sin red: ~26 s y recarga con página de error del navegador; la sesión sí se descarta).

**Pasos (test primero).**
1. Tests de componente: clic → texto "Cerrando sesión…", `aria-disabled="true"` y `cerrarSesion` llamado una sola vez aunque se haga clic dos veces; si rechaza, el botón vuelve a "Cerrar sesión".
2. Implementar en `AdminSidebar`.
3. e2e y doc.

**Verificación.** `npx vitest run src/shared/components/layout`, `npm run lint`, `npm run typecheck`. Toca una pantalla pero no Storage, permisos de anon ni rutas: corro yo `npm run test:e2e` como regresión y `npm run db:reset` (0023), sin `qa`.

**Fuera de alcance.** Cortar la espera de auth-js, evitar la página de error offline, el cierre por inactividad (no hay botón), revocar la sesión en el servidor.
