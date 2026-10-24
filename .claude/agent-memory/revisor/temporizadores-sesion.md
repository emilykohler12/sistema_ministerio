---
name: temporizadores-sesion
description: Trampas de temporizadores por hora del sistema (inactividad del admin, #22) - la actividad o el "extender" que llega tras el límite sin tic reinicia en vez de vencer; visibilitychange sin test; signOut que no borra la sesión (#46) y su error que no significa "no borró"
metadata:
  type: project
---

En cierre-inactividad (2026-10-23, `useInactividad`), el hook medía con `Date.now()` en un `setInterval` de 1 s, pero el handler de actividad
(`pointerdown`/`keydown`) y `extender` reiniciaban `ultimaActividad` sin comparar antes con el límite. Si el tic se demora (suspensión del equipo,
pestaña dormida), el primer evento vuelve a abrir una sesión ya vencida. El único resguardo era `visibilitychange`, que no tenía test.
También: en auth-js 2.117.3 `signOut()` **no** borra la sesión si el access token ya venció y el refresh falla por red (`_useSession` devuelve
`AuthRetryableFetchError` y `_signOut` retorna antes de `_removeSession`, `GoTrueClient.js` ~3431). Corrige en parte [[supabase-js-frontend]], que dice
"borra aunque falle la red": eso vale solo con el token vigente.

Se corrigió en la misma rama (Revisión 2): `alActividad` y `extender` llaman primero a `revisar` (este último por un `revisarRef`) y salen si
`vencidaRef` quedó en true. Es el molde a pedir. El comentario de `AdminLayout` que dice "signOut borra aunque falle la red" siguió sin corregir y
sin issue.

En signout-sin-red (#46, 2026-10-23), el fix trató `{ error }` de `signOut()` como "no borró": falso. Con el token **vigente**, una falla
de red en `/logout` borra la sesión, emite `SIGNED_OUT` **y** devuelve el error (`GoTrueClient.js:3443-3449`). Un fix que recarga ante
cualquier error rompe ese caso, que ya funcionaba: sin red, `location.assign` muestra la página de error del navegador y se pierde
`state.motivo`. Pedí que se mire si la clave sigue en storage antes de recargar, con su test. Una alternativa sin recarga: borrar la
clave y volver a llamar `signOut({ scope: 'local' })`. Sin sesión no hay `/logout` y corre `_removeSession` sin red. `stopAutoRefresh`
no hace falta: el tic lee de storage y la guarda de `_callRefreshToken` descarta un refresh que estaba en vuelo.

**Why:** un temporizador de seguridad que se puede "rescatar" con un clic tardío no cumple §5.2 (computadoras compartidas).
**How to apply:** en todo hook que vence por hora, cada camino que reinicia (eventos, botones) tiene que llamar primero a la revisión del
vencimiento. Pedí tests con `vi.setSystemTime(+límite)` **sin** `advanceTimersByTime`, y uno que despache `visibilitychange`.
