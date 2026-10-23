---
name: trampas-inactividad
description: Cómo probar temporizadores con page.clock en e2e del DAM (cierre por inactividad)
metadata:
  type: project
---
- `await page.clock.install()` antes de `loginAdmin`; luego `page.clock.fastForward(28*60_000 + 2000)` (el +2000 deja correr el tic de 1 s). Supabase Auth no molesta dentro de 30 min.
- Pestaña oculta: `clock.pauseAt` + `clock.setSystemTime(+31 min)` + `document.dispatchEvent(new Event('visibilitychange'))`.
- Para 320 px: `setViewportSize` DESPUÉS de `loginAdmin` (h1 Dashboard duplicado en móvil rompe el helper).
- El perfil qa no puede borrar archivos ni usar python/sed: un spec temporal solo se puede vaciar, no borrar; mejor no crearlos.
- Escape/clic en el fondo/"Seguir conectado" extienden; clic interno, scroll y Tab no.
