---
name: supabase-js-frontend
description: Huecos que se repiten al integrar supabase-js en el frontend del DAM; errores lanzados vs {error}, handlers async sin catch, verificación manual sin registrar, docs de estado sin actualizar por fase
metadata:
  type: project
---

En la Fase A de auth-configuracion (2026-10-10) aparecieron estos huecos, y es probable que se repitan en cada dominio
que pase de mocks a `consultas.ts`:

- Los envoltorios solo manejan el `{ error }` devuelto. supabase-js (auth-js 2.117) **relanza** todo error que no sea
  `AuthError` (storage, lock) y `handleSubmit` de RHF lo vuelve a lanzar: queda un rechazo sin capturar y no se ve el
  mensaje genérico que piden los criterios. Pedí `try/catch` y un test con `mockRejectedValue`.
- Hay handlers `async` en `onClick` sin `try/finally`, y queda `void promesa()` dentro de un `setTimeout`.
- La verificación manual de punta a punta (recargar, cerrar el navegador, el botón de cerrar sesión) se da por hecha y
  no queda anotada en `notas.md`, y el componente que la dispara (`AdminSidebar`) no tiene test.
- Cuando la spec se entrega en fases con PR separados, `docs/arquitectura.md` y "Estado actual" en `CLAUDE.md` quedan
  desactualizados en `main`.

Datos de la librería, para no reportar falsos positivos:
- En auth-js 2.117.3, `signOut()` borra la sesión local aunque `/logout` falle por red y devuelve `{ error }` sin
  lanzar. El `SIGNED_OUT` llega igual.
- El bundle contiene el string `sb_secret_` porque supabase-js detecta el prefijo de la clave: no es una fuga. Para
  buscar una clave real, usá `sb_secret_[A-Za-z0-9_-]{6,}` y JWT `eyJ…\.…`.
- Para verificar la clave publishable sin leer `.env*`, pasá `npx supabase status -o json` por stdin a un script de Node
  en el scratchpad, que haga `/auth/v1/token` y `rpc/es_admin` sin imprimir la clave. Los hooks bloquean cualquier
  comando que mencione `.env`, incluso un grep.

**Why:** los criterios del DAM dicen "cualquier otro error muestra un mensaje genérico", y la evidencia tiene que ser
un test o una verificación manual anotada.
**How to apply:** en cada `consultas.ts` y en cada formulario o botón que lo use, buscá los caminos de rechazo, no solo
el `{ error }`. Pedí que la verificación manual quede anotada en `notas.md` y fijate si la fase deja desactualizadas
las docs de estado. Ver también [[supabase-privilegios-y-tests]].
