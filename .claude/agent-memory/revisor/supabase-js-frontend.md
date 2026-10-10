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

En la Fase B (configuración, 2026-10-10) se repitió con otra forma:
- Se manejó el error de *guardar*, pero no el de *cargar*. Si `useX()` falla, el formulario de edición del admin se
  muestra vacío sin aviso, y guardar manda todos los campos, así que puede pisar datos reales con `''`. En cada pantalla
  de edición, revisá el `isError` de la query además del de la mutation.
- La verificación en el navegador (el paso de punta a punta) vuelve a quedar como "no se verificó" en `notas.md`.
- Hay un criterio de la spec reescrito durante la implementación que no figura en los desvíos de `notas.md`. Hacé
  `git diff main -- spec.md`.

En niveles-categorias (2026-10-10, tercera vez) la pantalla principal (`CategoriaFormPage`) quedó bien, pero el hueco
pasó a las **pantallas vecinas** que leen el mismo hook: `TalleresListPage` y `TallerFormPage` solo distinguen
`data === null` ("no encontrado"). Con un error, `data` queda `undefined` y la pantalla muestra "Cargando..." para siempre.
Tampoco comprueban que el `:categoriaId` sea del `:nivelId` de la URL. Volvió a faltar el registro de la verificación en
el navegador en `notas.md` (por tercera vez).
- Para revisar: en cada `useX(id)` que devuelve `null` si no existe, buscá **todos** los consumidores con grep y revisá
  las tres ramas (`undefined` por error, `null` y un id de otro padre).
- El script de la API en el scratchpad (24 comprobaciones de RLS por REST) sirve de molde. Cubre `.single()` para
  PATCH bloqueados (406/PGRST116) y 23505/23514/22001/23503 por REST.

Datos de la librería, para no reportar falsos positivos:
- En el working tree, la mayoría de los archivos de `src/` tiene CRLF (vienen de Windows), aunque el índice está en LF
  y `.gitattributes` tiene `eol=lf`. El warning "CRLF will be replaced" no indica un problema de una edición por shell:
  compará con `git ls-files --eol` y mirá si el diff quedó limpio.
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
