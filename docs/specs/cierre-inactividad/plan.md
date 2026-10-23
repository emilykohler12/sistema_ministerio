# Plan: cierre de sesión por inactividad (#22)

**Objetivo:** el admin que no toca el panel durante 30 minutos pierde la sesión (§5.2, computadoras compartidas). Dos minutos antes ve un aviso con "Seguir conectado".

**Archivos:**
- `src/features/auth/useInactividad.ts` (+ test): hook puro de temporizador, sin supabase. Recibe `activo`, `limiteMs`, `avisoMs` y `onVencida`; devuelve `{ aviso, extender }`.
- `src/features/auth/components/AvisoInactividad.tsx` (+ test): diálogo con cuenta regresiva y botón "Seguir conectado".
- `src/shared/components/layout/AdminLayout.tsx` (+ test): monta el hook cuando hay usuario; al vencer llama a `cerrarSesion()` y navega a `/admin/login` con un mensaje.
- `src/pages/admin/LoginPage.tsx` (+ test): muestra "Tu sesión se cerró por inactividad" si llega ese estado.

**Pasos (test primero, con `vi.useFakeTimers`):**
1. `useInactividad`: sin eventos vence a los 30 min; `pointerdown`, `keydown`, `scroll` y `touchstart` reinician; el aviso aparece a los 28 min; `extender` reinicia; si `activo` es false no hay temporizador; limpia los listeners al desmontar.
2. `AvisoInactividad`: `role="alertdialog"`, cuenta regresiva anunciada sin saturar al lector de pantalla, foco en "Seguir conectado".
3. `AdminLayout`: al vencer, `cerrarSesion` y redirección con el mensaje.

**Decisiones del plan:**
- El temporizador vive en `AdminLayout`, no en `AuthProvider`: solo importa dentro del panel y no corre en el portal público.
- Cada pestaña tiene su propio temporizador: la sesión ya está en `sessionStorage` por pestaña.
- Con el aviso visible, la actividad ambiente (clics, teclas, scroll) no lo oculta ni reinicia el plazo: solo `extender` ("Seguir conectado", Escape o el fondo). Un `alertdialog` pide una respuesta explícita; si un `scroll` o un `Tab` lo ocultaran, el usuario no sabría que extendió la sesión.
- Una actividad o un `extender` que llegan después del límite, antes del próximo tic, cierran la sesión en lugar de reiniciar el plazo (se revisa la hora del sistema primero).
- Se mide con la hora del sistema (`Date.now()`) y no solo con `setTimeout`, porque el navegador demora los temporizadores de pestañas en segundo plano.

**Fuera de alcance:** recuperación de contraseña (#21), el cierre de sesión del servidor (la sesión de Supabase sigue vigente hasta su vencimiento propio), cualquier cambio de base de datos.

**Verificación:** `npx vitest run` de los archivos tocados, `npm run lint`, `npm run typecheck`, `npm run test:e2e` como regresión (toca una pantalla y rutas: después `qa` si el revisor lo ve necesario) y `npm run db:reset`.
