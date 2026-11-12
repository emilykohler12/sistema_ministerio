# Revisión 1: logo institucional (#23)

Revisé el diff sin commitear de `feat/logo-institucional` contra `spec.md` (aprobada), con `contexto.md` y `critica.md` (13 puntos
aceptados). Leí todos los archivos nuevos (`??`) y los modificados, `shared/lib/storage.ts`, `erroresStorage.ts`, `AuthContext.tsx`
y el código de React Query 5.104 en `node_modules` (`queryCache.clear`, `QueryObserver.setOptions`, `useBaseQuery`).

## Veredicto
Cambios necesarios

## Problemas

- **[crítico]** `src/app/providers/AppProviders.tsx:18` y `src/app/Favicon.tsx:11`: después de un login en la SPA, el favicon deja de
  seguir el logo (incumple el criterio 7, «cambia al cambiar el logo, sin recargar»). `<Favicon />` es hermano de `AuthProvider` y no se
  vuelve a renderizar cuando cambia la sesión. En el login, `AuthContext.tsx:49` hace `queryClient.clear()`. `queryCache.clear()` saca la
  query `['configuracion']` del caché (`query.destroy()` y `notify('removed')`) sin avisar a los observers. El `QueryObserver` del favicon
  sigue atado a la query vieja hasta que se llame `setOptions`, y eso solo pasa en un efecto de `useBaseQuery` cuando el componente se vuelve
  a renderizar (`useBaseQuery.js:35-37`). Nadie lo vuelve a renderizar: `AppProviders` no cambia y el foco de la ventana solo recorre las
  queries que siguen en el caché. Después `ConfiguracionPage` crea una query `['configuracion']` nueva, y el `setQueryData` de
  `useCambiarLogo` y `useQuitarLogo` actualiza esa, no la que mira el favicon. Pasa en el flujo principal: abrir `/admin/login`, entrar,
  ir a Configuración y cambiar el logo. Es el paso 2 de la verificación de punta a punta. Con una sesión que ya existía al cargar
  (`INITIAL_SESSION`) no se limpia el caché y sí funciona. Los tests de `Favicon.test.tsx` montan un `QueryClient` sin `clear()`, por eso
  no lo ven. **Arreglo:** que el favicon se vuelva a renderizar cuando cambia el usuario. Por ejemplo, montarlo dentro de `AuthProvider` y
  leer `useAuth().usuario`, o ponerle `key={usuario?.id}`. Sumar un test: con logo, `client.clear()`, después
  `setQueryData(['configuracion'], { logo_ruta: 'nuevo.png' })` y verificar que el `href` cambia (hoy falla). Lo dedujo el revisor leyendo
  el código, sin un test propio porque el perfil no lo permite. El `qa` lo confirma con el e2e (`link[rel=icon]` tras `loginAdmin`).

- **[importante]** `src/pages/admin/ConfiguracionPage.tsx:74-91`, `:155`: tras «Cambiar logo» el foco no vuelve al botón (criterio 8:
  «el foco vuelve al botón que se usó»). Mientras sube, «Cambiar logo» queda `disabled={ocupado}` y tiene el foco. Por la regla de
  *focus fixup* del navegador, el foco cae en `body`. El efecto de `:65-70` solo lo devuelve si `enfocarCambiar.current` es `true`, y eso
  se pone solo en `onQuitarLogo`. jsdom no saca el foco de un botón deshabilitado, así que ningún test lo cubre. `RecursosPage` es el
  molde: devuelve el foco al terminar una subida. **Arreglo:** poner `enfocarCambiar.current = true` también al terminar `onArchivoLogo`,
  con éxito o con error (en un `finally` después del `mutateAsync`). Test: con `cambiarLogo` resuelto, `cambiar()` tiene el foco
  (`toHaveFocus`) después de anunciar «Logo actualizado». El `qa` verifica en el navegador que el foco no cae en `body`.

- **[importante]** `src/features/configuracion/hooks/useLogo.ts:21-36`: con `PGRST116` («el logo cambió en otra sesión») no se invalida
  `['configuracion']`. El reintento que pide el criterio 2 («falla con un error y hay que reintentar») vuelve a fallar si no se recarga:
  la caché sigue con el `anterior` viejo, cada intento sube un archivo, recibe `PGRST116` y lo compensa. Con `staleTime: 60_000`, ni el foco
  de la ventana refresca antes de un minuto. El mensaje dice «Recargá la página», pero `rules/datos.md` («Invalidar ante un error… todos los
  hooks que puedan recibir ese código invalidan en `onSettled`») y el punto 4 de la crítica piden invalidar. **Arreglo:** `onError` (o
  `onSettled`) que invalide `['configuracion']` en las dos mutaciones. El aviso vive en el estado local de la página y no se desmonta, porque
  `isPending` de la query sigue en `false` con datos. Así el mensaje puede decir «Probá de nuevo». Test en `useLogo.test.ts`: un rechazo
  `PGRST116` vuelve a pedir `obtenerConfiguracion`.

### Verificado sin problemas
- **Criterios 1-10, cada uno con un test que falla sin el código:**
  - 1: `LogoInstitucional`, `PublicHeader` y `AdminSidebar` (iniciales o `School`). El `favicon.svg` nuevo es el `School` en `#142450`, ya
    no el rayo `#863bff`.
  - 2: `secuencias.test` (orden subir → actualizar → borrar, huérfano con aviso) y `ConfiguracionPage.test` («Misión» se conserva al
    cambiar y al quitar, `cambiarLogo(file, anterior)`).
  - 3: `archivos.test`, `errores.test` y la página con `.gif`, más de 2 MB y 413.
  - 4: `quitarLogo`, la página y la confirmación.
  - 5: compensación solo con `code` no vacío, sin compensar con `code ''` ni con `TypeError`.
  - 6: `fireEvent.error`, con un reintento cuando cambia la URL.
  - 7: `Favicon.test`, salvo el problema crítico.
  - 8: `alt=""` en el encabezado, el pie y la barra; `alt` en la vista previa; un único `role="status"` siempre montado; `type="button"`
    fuera del `<form>`; foco tras «Quitar logo» con `toHaveFocus`.
  - 9: `logo.test.sql`, con 32 asserts: el CHECK con `.gif`, `.jpeg`, `.PNG`, uuid en mayúsculas, carpeta y cadena vacía; el bucket; las
    políticas; anon, usuario sin marca y admin; y el UPDATE condicional.
  - 10: `referencias.test`.
- **Seguridad:**
  - La migración no tiene funciones. Las políticas del bucket son solo para `authenticated` con `es_admin()` (select, insert y delete; sin
    update) y `storage_global` pasa. La escritura de `configuracion` sigue con la RLS que ya existía.
  - La ruta es siempre `<uuid>.<ext>` y no usa el nombre del archivo. El MIME sale de la extensión y el bucket rechaza cualquier otro.
  - Un `.png` que no es imagen se sirve como `image/png` y cae al fallback. Solo lo puede subir el admin, y la crítica ya lo había aceptado.
  - El `src` y el `href` salen de `getPublicUrl` sobre una ruta limitada por el CHECK, así que no hay `javascript:` ni otro origen posible.
- **ADR 0016 y `rules/datos.md`:**
  - El orden es subir → UPDATE condicional (`.eq('logo_ruta', anterior)`, o `.is(…, null)` si no había) → borrar el anterior.
    `consultas.test` prueba la cadena del query builder.
  - El anterior solo se borra si el UPDATE condicional afectó la fila, así que es la ruta que la base confirmó.
  - No hay RPC.
- **Tests existentes:** ninguno se debilitó. El de «no ofrece ningún control para cambiar el logo» se reemplazó como pedía la spec, y el de
  `:59` («no recibe `logo_ruta`») sigue. Los mocks de configuración en `AdminLayout*.test` y `AdminSidebar.test` son consecuencia directa
  del cambio.
- **Desvíos que reportó el implementador; ninguno es un problema:**
  - `<link rel="icon">` sin `type`: es lo que pide la spec.
  - `staleTime: 60_000`: no rompe ningún test y la escritura propia actualiza la caché con `setQueryData`. Solo agrava el problema de
    `PGRST116` de arriba.
  - `PublicHeader.tsx` editado por shell: está en LF y lint pasa.
  - Input propio con un botón en lugar de `FileDropzone`: la spec no exigía el dropzone y el botón se opera con teclado.
  - Fallback «Sitio institucional» en `AdminSidebar`: el mismo del encabezado.
- **Documentación:** `docs/arquitectura.md` (dominio, migración y brechas) y la nota en 0016.

## Evidencia
- `npm run lint`: 0 errores. Quedan 3 warnings que ya estaban, en `AuthContext.tsx`, `DescargaModal.tsx` y `TallerFormPage.tsx`; ninguno es
  de archivos del cambio.
- `npm run typecheck` (`tsc -b`): sin salida, pasa.
- `npm test`: 111 archivos y 1908 tests, todos pasan.
- `npm run test:db`: 23 archivos y 827 tests, `Result: PASS` (incluye `logo.test.sql ... ok` y `configuracion.test.sql ... ok`). Antes y
  después corrí `npm run db:reset`.
- `npm run build`: no lo pude correr porque lo bloquea el perfil del revisor («npm run build no está permitido»). Tiene que correrlo el
  coordinador.
- No corrí e2e ni Playwright (le toca al `qa`) y no usé la nube.
