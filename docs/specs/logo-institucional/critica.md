# Crítica de la spec: logo institucional (#23)

Leí la spec, `contexto.md`, los ADR 0007, 0013, 0016 y 0017, las reglas `datos.md`, `react.md` y `migraciones.md`, y el código y las
migraciones que se citan abajo. No reabro el formato (PNG/JPG/WebP, 2 MB, sin SVG), las acciones inmediatas ni los cuatro lugares
del logo: el usuario ya los decidió. Con el perfil de lectura no corrí `test:db`, `vitest` ni `typecheck`. Lo de react-hook-form
lo verifiqué en `node_modules`. Lo de Safari y el favicon no lo verifiqué.

## Veredicto
Hay mejoras

Si solo se cambia una cosa: sacar el bloque del logo del `<form>` de `ConfiguracionPage` y fijar `resetOptions: { keepDirtyValues: true }`.
Así como está escrita, la spec hace que «Quitar logo» envíe el formulario y que cambiar el logo borre lo que el admin estaba escribiendo.

## Puntos

1. **Los botones del logo y el `ConfirmDialog` quedan dentro del `<form>` y lo envían** (alta). La spec ubica los controles en el lugar
   de las iniciales, en `ConfiguracionPage.tsx:96-103`, que está dentro del `<form onSubmit>` (`:92`). `Button` no define `type`
   (`ui/Button.tsx:12-16`), así que adentro de un form es `submit`. `Dialog` no usa portal (`ui/Dialog.tsx`: sin `createPortal`; solo la X
   lleva `type="button"`, `:61`). Por eso `ConfirmDialog` hereda el problema: «Cancelar» y «Quitar» (`ConfirmDialog.tsx:25-33`) envían el
   formulario si se renderizan dentro. «Cambiar logo», si no lleva `type="button"`, también lo envía.
   **Alternativa:** poner el logo en su propia `Card` fuera del `<form>`, arriba o al lado, con su `role="status"` y su `ConfirmDialog`. La
   separación queda en el DOM y no depende de acordarse de poner `type="button"` en cada botón. Sería además la expresión literal de
   «independientes de Guardar».

2. **Cambiar o quitar el logo resetea el formulario y pierde lo que no se guardó** (alta). El form usa `useForm({ values: data })`
   (`ConfiguracionPage.tsx:49`). En react-hook-form 7, cuando `values` cambia, se llama a `control._reset(props.values, { keepFieldsRef: true,
   ...resetOptions })` (`node_modules/react-hook-form/dist/index.esm.mjs:3765-3769`). La comparación es `deepEqual` sobre toda la fila, así que
   alcanza con que cambien `logo_ruta` o `updated_at`. Sin `resetOptions` no se conservan los valores editados. La spec hace `setQueryData`
   de `['configuracion']` tras cada mutación del logo. Un admin que corrige el teléfono, cambia el logo y después pulsa «Guardar» pierde la
   corrección sin ningún aviso.
   **Alternativa:** `useForm({ resolver, values: data, resetOptions: { keepDirtyValues: true } })`, con un test: editar un campo, cambiar el
   logo y comprobar que el campo conserva lo escrito. Tras «Guardar» los campos ya no están sucios, así que el reset de siempre sigue andando.

3. **El `favicon.svg` por defecto es el logo de Vite** (alta). `public/favicon.svg` es el rayo violeta de Vite (`fill="#863bff"`,
   `viewBox 0 0 48 46`). Hoy no se ve porque `index.html` no lo enlaza. El criterio 7 («sin logo usa `favicon.svg`») y el `<link>` del diseño
   pondrían la marca de Vite en la pestaña del sitio del Ministerio en dos casos: siempre que no haya logo, y en cada carga con logo, hasta que
   llega la configuración.
   **Alternativa:** reemplazar `public/favicon.svg` por un ícono neutro (por ejemplo el `School` de lucide exportado como SVG, con los colores
   `primary`) y anotarlo en la spec como parte del corte. Cuesta un archivo.

4. **La RPC `cambiar_logo` no hace falta: alcanza un UPDATE condicional, que ya es molde del proyecto** (media). Lo que la regla de
   `datos.md` quiere es que el archivo que se borra sea el que la base tenía. `recursos.actualizarRecurso` ya lo resuelve sin RPC, con
   `.eq('ruta_archivo', rutaAnterior)` + `.select().single()` (`src/features/recursos/consultas.ts:30-36`, de fix-ruta-recursos): si la fila
   ya no apunta a ese archivo, no hay UPDATE y el error es `PGRST116`, que cuenta como rechazo y dispara `compensar`. Para el logo sería
   `update({ logo_ruta: nueva }).eq('id', 1)` más `.eq('logo_ruta', anterior)` o `.is('logo_ruta', null)`, y después `.select().single()`. Si
   la condición se cumplió, la ruta anterior es la de la base y se puede borrar. Con Postgres 17 (`supabase/config.toml:41`) no existe
   `RETURNING old.*`, que daría lo mismo en una sentencia.
   Qué se gana:
   - no hay función, ni grants, ni `revoke from public, anon`, ni pgTAP de la RPC (la RLS de update ya está probada en `configuracion.test.sql`);
   - se esquivan las trampas de `db:types`: `p_ruta text` sale tipado `string` y no admite `null` para «quitar» sin `default null`, y
     `RETURNS TABLE` llega como array con `ruta_anterior: string` no nulo, que habría que tipar a mano;
   - la mutación recibe la fila completa y el `setQueryData` queda igual que en `useGuardarConfiguracion`, con `updated_at` al día. Con la RPC
     habría que parchear la caché con un merge.

   Los triggers no cambian en ningún caso: `configuracion_auditar` y `configuracion_tocar_updated_at` no tienen `WHEN`
   (`20261010015619_configuracion.sql:61-67`), así que el UPDATE, venga de una RPC invoker o de PostgREST, deja una fila de auditoría y toca
   `updated_at`. Ante dos admins a la vez, el segundo recibe `PGRST116`, se compensa su subida y ve «El logo cambió en otra sesión», con
   `onSettled: invalidar` según `datos.md`. Me parece mejor que un «gana el último» silencioso.
   **Si se mantiene la RPC**, tiene que hacer `es_admin()` → `42501` antes del `FOR UPDATE`. Con invoker, la RLS de update filtra la fila
   para quien no tiene la marca, el `select ... for update` no ve nada y la RPC devolvería vacío sin error. Además lleva `p_ruta text default
   null` y `revoke ... from public, anon`. El criterio 9 («RPC que da 42501») pasa a ser «un no admin no cambia la fila», que ya está probado.

5. **Extensión, MIME y la `.jpeg`** (media). El CHECK admite solo `jpg`, pero los archivos de cámara suelen llamarse `.jpeg` o `.JPG`.
   `recursos/archivos.ts:19-20` acepta las dos extensiones con `image/jpeg`. Si `validarLogo` mira solo `.jpg`, rechaza logos válidos. Si
   `rutaNueva()` copia la extensión original, el UPDATE da `23514`.
   **Alternativa:** que `validarLogo` devuelva `{ ext, mime }` desde una tabla `png | jpg | jpeg | webp` (en minúsculas, `jpeg` → `jpg`) y que
   el MIME salga de la extensión y no de `file.type`, porque `subirArchivo` de `shared/lib/storage` lo recibe aparte. CHECK con el molde de
   normativas (`20261010155300_normativas.sql:15`): `logo_ruta ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$'`, con nombre explícito
   (`configuracion_logo_ruta_formato`). Un `alter table ... add constraint` en una migración nueva cumple `migraciones.md`, y la fila sembrada
   tiene `logo_ruta` NULL. pgTAP con `x.gif`, `<uuid>.PNG`, `../<uuid>.png` y `<uuid>.jpeg` → `23514`.

6. **El foco no puede volver a «Quitar logo», porque el botón desaparece** (media). El criterio 8 pide que el foco vuelva al botón que
   se usó. `ConfirmDialog` llama a `onConfirm()` y enseguida a `onClose()` (`ConfirmDialog.tsx:31-32`), y `useFocusTrap` restaura el foco al
   disparador (`useFocusTrap.ts:63`) antes de que la mutación termine. Cuando termina, ya no hay logo, «Quitar logo» se desmonta y el foco
   cae en `body`. Es el mismo patrón del botón de fila que desaparece de instituciones-sin-vincular.
   **Alternativa:** después de quitar, llevar el foco a «Cambiar logo», que siempre existe, y probarlo con `toHaveFocus()`. Mientras una
   mutación está pendiente, deshabilitar los dos botones: así no se cruzan «Quitar» y «Cambiar».

7. **La URL, el fallback y el parpadeo de `LogoInstitucional`** (media).
   - Los componentes no pueden llamar a `consultas.ts` (`react.md`), así que `urlLogo(ruta)` no se puede usar desde el componente.
     **Alternativa:** un hook `useLogo()` sobre `useConfiguracion` que devuelva `{ url, nombre, isPending }`. Lo usan `LogoInstitucional`, el
     favicon y la vista previa del panel.
   - Con `onError` y un `useState(fallo)`, una URL que falló una vez deja el lugar en iniciales aunque después llegue un logo nuevo.
     **Alternativa:** `key={url}` en el `<img>` o en el componente, para que el estado arranque de cero con cada URL.
   - Mientras carga la configuración, `PublicHeader` muestra `School` (iniciales vacías, `PublicHeader.tsx:29`), después «MD» y recién al
     final el logo, en cada carga del portal. **Alternativa:** con `isPending`, renderizar la caja vacía del mismo tamaño. Ponerle `width` y
     `height` fijos al `<img>`, `object-contain` y no `rounded-full`: el pie y la página usan círculos (`PublicFooter`, `ConfiguracionPage.tsx:98`)
     y recortarían un logo rectangular.
   - La ubicación en `features/configuracion/components/` está bien. `shared/components/layout` ya importa `useConfiguracion`
     (`PublicHeader.tsx:4`, `PublicFooter.tsx:2`), así que no se suma ningún acoplamiento.

8. **Mecánica del favicon: dónde va y qué evitar. No hace falta recortarlo** (media). No hay un layout común: el login, `recuperar` y
   `nueva-contrasena` quedan fuera de `PublicLayout` y de `AdminLayout` (`src/app/router.tsx:72-86`). «La raíz» tiene que ser un componente
   dentro de `AppProviders`, en `App.tsx`, por ejemplo `<FaviconInstitucional />` hermano de `AppRouter`.
   **Alternativa concreta:**
   - un solo `<link rel="icon" href="/favicon.svg">` **sin** `type` en `index.html`, y el efecto cambia solo `href`, de la URL del logo
     a `/favicon.svg` y de vuelta. Un `type="image/svg+xml"` que queda mientras el `href` pasa a un PNG es una razón para que algunos navegadores
     lo ignoren, y sin `type` el navegador detecta el formato;
   - nada de canvas para «cuadrar» el ícono: con una imagen de otro origen y sin `crossOrigin`, el canvas queda contaminado y `toDataURL`
     lanza `SecurityError`.

   No propongo recortarlo: son unas 15 líneas y el usuario lo pidió. Pero hay límites que conviene escribir en «Fuera de alcance»:
   - en cada carga se ve primero el ícono por defecto y después el logo;
   - los marcadores, los resultados de buscadores y las vistas previas de enlaces usan el ícono estático;
   - Safari puede no actualizarlo en caliente (no lo verifiqué).

   Si alguno de esos límites no es aceptable, la única salida es un favicon estático cambiado a mano, y eso es otra decisión.

9. **`AdminSidebar` tiene el nombre fijo y los tests pasan a necesitar la configuración** (baja). Al lado del bloque «SE» dice
   «Subsecretaría de Educación» fijo (`AdminSidebar.tsx:33-39`). Si `LogoInstitucional` cae a `getInitials(config.nombre)`, el panel muestra
   «MD» junto a «Subsecretaría…», y el argumento de `alt=""` («el nombre está al lado») vale a medias. Además, `AdminSidebar.test.tsx:19-27`
   y los dos `AdminLayout*.test.tsx` renderizan la barra sin mockear `@/features/configuracion/consultas`.
   **Alternativa:** que la barra muestre `config.nombre`, como el encabezado, y sumar el mock de configuración a esos tres tests. Si se
   prefiere no tocar el texto, decirlo en la spec y mantener «SE» como fallback de la barra.

10. **«Guardar» y una mutación del logo en paralelo pisan la caché** (baja). Las dos hacen `setQueryData` con la fila que devolvió su
    UPDATE. Si la respuesta de «Guardar» llega después del cambio de logo pero su UPDATE se confirmó antes, la caché vuelve a la ruta vieja,
    que ya se borró. El `<img>` da 404 y se ven las iniciales hasta la próxima recarga.
    **Alternativa:** deshabilitar «Cambiar» y «Quitar» con `guardar.isPending`, y «Guardar» con el logo pendiente. Son dos `disabled`.

11. **El mismo archivo no se puede volver a elegir** (baja). Un `<input type="file">` no dispara `change` si se elige el mismo archivo
    que antes. Después de un error de red, reintentar con el mismo logo parece no hacer nada.
    **Alternativa:** volver `input.value = ''` después de leer el archivo, o reutilizar `FileDropzone` si ya lo hace.

12. **Pruebas** (baja).
    - `ConfiguracionPage.test.tsx:178-181` y el comentario de `:14` se reemplazan. `:59` («no recibe `logo_ruta`») se queda: sostiene la
      independencia de «Guardar».
    - Con jsdom no se carga ninguna imagen: el fallback se prueba con `fireEvent.error(img)`.
    - En el e2e, usar un PNG válido de 1x1 (molde del buffer de `e2e/recursos.spec.ts:7`) y comprobar que `naturalWidth > 0`. Si no, un PNG
      roto pasa el test porque cae a las iniciales. Revisar también que el `href` de `link[rel=icon]` contenga `/logo/`. `configuracion` es una
      sola fila compartida por todas las specs, así que el e2e quita el logo al final, en `finally` o `afterEach`.
    - El test que la spec pide en `planificar` no prueba nada nuevo, porque `planificar` es genérico por clave (`scripts/storage/planificar.ts:14,27`).
      Lo que cambia es `leerReferencias` (`scripts/limpiar-storage.ts:26,81-82`): con el paso 6 de la verificación alcanza.

13. **Alcance: entra en un corte** (baja). Sin la RPC (punto 4), el corte es una migración chica (bucket, dos políticas y el CHECK), un
    dominio con el molde de normativas, un componente, la página, un efecto de favicon y una línea del script. Es menos que el corte de
    normativas, así que no lo dividiría.

### Revisados sin cambios
- **Caché y CDN:** cada subida usa un uuid nuevo y storage-js manda `cache-control: max-age=3600` (`storage-js/dist/index.mjs:599,625`), así que
  no se puede ver un logo viejo con la URL nueva. Un visitante con la configuración en caché sigue pidiendo la URL vieja, que ya se borró, y
  ve las iniciales (criterio 6). Es aceptable.
- **CORS:** un `<img>` sin `crossOrigin` no lo necesita.
- **Guardias:** `storage_global` cubre las políticas de escritura de cualquier bucket nuevo y `rls_global` ya cubre `configuracion`. No
  verifican que el admin pueda escribir, así que el pgTAP propio del bucket hace falta, como dice la spec.
- **Contenido del archivo:** el bucket valida solo el MIME declarado, que fija el cliente. Un `.png` que no es una imagen no se decodifica y
  cae al fallback. Una imagen enorme en píxeles solo la puede subir el admin, y el tope de 2 MB limita el riesgo. No propongo validar
  dimensiones: queda fuera de alcance.
- **Compensación (0016):** el molde de `normativas/secuencias.ts:33-62` (`compensar` ante un rechazo y `borrarOAvisar` para el anterior)
  sirve tal cual. Si falla el borrado del anterior, el cambio se informa como hecho y queda un huérfano. Conviene escribirlo en el criterio 2,
  que hoy promete «se borra el logo anterior».

## Respuesta

Acepto los 13 puntos; ninguno rechazado. Las tres altas cambian la forma de implementar y se resuelven en el corte. Los que cambian algo que el usuario vio se marcan (*) y se le consultan antes de aprobar.

1. **Acepto (alta).** El logo va en su propia `Card` fuera del `<form>`, con su `role="status"` y su diálogo de confirmación. Además, todo `Button` del bloque lleva `type="button"`. Test: pulsar «Quitar logo» o «Cancelar» del diálogo no envía el formulario.
2. **Acepto (alta).** `useForm({ values: data, resetOptions: { keepDirtyValues: true } })`. Test: editar un campo, cambiar el logo y comprobar que el campo conserva lo escrito.
3. **Acepto (alta) (*).** `public/favicon.svg` es el rayo violeta de Vite (`#863bff`, verificado). Se reemplaza por un ícono neutro (el `School` en SVG), como parte del corte. Cambia lo que ve el usuario cuando no hay logo.
4. **Acepto (media) (*).** Se descarta la RPC `cambiar_logo`. En su lugar, un UPDATE condicional `update({ logo_ruta: nueva }).eq('id', 1).eq('logo_ruta', anterior)` (o `.is('logo_ruta', null)` si no había), seguido de `.select().single()`, como `recursos.actualizarRecurso`. Si la fila ya no apunta al archivo anterior da `PGRST116`, que dispara `compensar`; si la condición se cumple, la ruta que se borra es la de la base. Se van la función, los grants y su pgTAP. La migración queda en bucket, políticas y `CHECK`. Efecto colateral aceptado: si otro admin cambió el logo mientras, este cambio falla con un error y hay que reintentar.
5. **Acepto (media).** Se aceptan `jpg`, `jpeg` y mayúsculas; el archivo se guarda siempre como `.jpg` y el MIME sale de la extensión (como `recursos/archivos.ts`), no de `file.type`. `CHECK` con nombre explícito: `'^[0-9a-f-]{36}\.(png|jpg|webp)$'`.
6. **Acepto (media).** Tras «Quitar logo» el foco va a «Cambiar logo»; los dos botones se deshabilitan mientras hay una mutación pendiente. Test `toHaveFocus()`.
7. **Acepto (media).** Un hook `useLogo()` sobre `useConfiguracion` (el componente, el favicon y la vista previa no llaman a `consultas.ts`); `key={url}` en la imagen; con `isPending`, una caja vacía del mismo tamaño; tamaño fijo, `object-contain` y sin `rounded-full`.
8. **Acepto (media).** El favicon se queda en el alcance. Un componente dentro de `AppProviders` (`App.tsx`) —las páginas de login quedan fuera de los layouts—, un solo `<link rel="icon">` sin `type` y se cambia solo el `href`; sin canvas. Los límites van a «Fuera de alcance»: se ve primero el ícono por defecto en cada carga; marcadores y buscadores usan el estático; Safari puede no actualizar en caliente (sin verificar).
9. **Acepto (baja) (*).** `AdminSidebar` muestra `config.nombre` en lugar del «Subsecretaría de Educación» fijo, para que el nombre y las iniciales coincidan. Cambia un texto visible del panel. Se agregan los mocks de configuración a `AdminSidebar.test.tsx` y a los dos `AdminLayout*.test.tsx`.
10. **Acepto (baja).** Mientras uno de «Guardar» o el logo está pendiente, el otro queda deshabilitado, para que la respuesta tardía de uno no pise la caché con una ruta ya borrada.
11. **Acepto (baja).** `input.value = ''` después de leer el archivo, para poder reelegir el mismo.
12. **Acepto (baja).** Se reemplaza `ConfiguracionPage.test.tsx:178-181` (y el comentario de `:14`); `:59` se queda. El fallback se prueba con `fireEvent.error`. El e2e usa un PNG válido, comprueba `naturalWidth > 0` y el `href` de `link[rel=icon]`, y quita el logo al final (la fila `configuracion` es una sola y la comparten todas las specs). Sin test nuevo de `planificar` (es genérico); el cambio es `leerReferencias`.
13. **Acepto (baja).** No se divide: sin la RPC cabe en un corte. Criterio 2 reescrito: si falla el borrado del anterior, el cambio se informa como hecho y queda un huérfano.

# Crítica del código

Leí el diff sin commitear de `feat/logo-institucional` contra la spec aprobada y la `## Respuesta` de arriba, las reglas `datos.md`,
`react.md` y `migraciones.md`, y verifiqué en `node_modules` lo de react-hook-form 7.89. El perfil del crítico no deja correr
`lint`, `typecheck`, `build` ni `vitest` (el hook los bloquea), así que **los checks quedan para el agente principal**. No reabro
el formato, las acciones inmediatas, los cuatro lugares ni el UPDATE condicional. (El pedido era escribir en `critica-codigo.md`, pero el
perfil `critico` solo puede escribir `critica.md`; por eso va como sección al final.)

## Veredicto
Hay mejoras

Si solo se cambia una cosa: que las mutaciones del logo invaliden `['configuracion']` ante un error y que `PGRST116` no pida «Recargá la página».
Hoy, después de un choque con otro admin, el reintento falla siempre, y recargar borra lo que el admin escribió sin guardar (criterio 2).

## Puntos

1. **Después de `PGRST116` el reintento falla siempre, y la salida que se ofrece pierde lo escrito** (media).
   `useCambiarLogo` y `useQuitarLogo` solo tienen `onSuccess` (`hooks/useLogo.ts:23-37`). La caché sigue con el `logo_ruta` viejo, así que el
   próximo intento manda el mismo `anterior` y vuelve a dar `PGRST116`. Con `staleTime` de 60 s y `refetchOnWindowFocus: false`
   (`AppProviders.tsx:9-10`), nada lo refresca solo. El mensaje (`errores.ts:5`) le pide al admin «Recargá la página», y una recarga borra
   lo que escribió sin guardar: justo lo que `keepDirtyValues` protege. `datos.md` ya pide `onSettled: invalidar` cuando el mensaje habla de
   recargar, y la crítica de la spec (punto 4) lo nombraba.
   **Alternativa:** `onError: () => queryClient.invalidateQueries({ queryKey: ['configuracion'] })` en las dos mutaciones (sirve también
   `onSettled`), y un mensaje como «El logo cambió en otra sesión: ya mostramos el actual. Probá de nuevo.». La Card no se desmonta, porque
   `data` sigue definida durante la recarga, y `keepDirtyValues` conserva lo escrito. Test: un `PGRST116` vuelve a llamar a `obtenerConfiguracion`.
   **Qué se gana:** el reintento funciona sin recargar y no se pierde nada.

2. **La Card del logo ocupa más de la mitad de `ConfiguracionPage` y no comparte nada con el formulario** (media).
   `ConfiguracionPage.tsx:44-104` y `:145-200` son tres `useState`, tres refs, un efecto, dos handlers y el `ConfirmDialog`, todos usados solo por la
   Card. Lo único que la une a la página es la deshabilitación cruzada (`:62-64`).
   **Alternativa:** pasarla a `features/configuracion/components/TarjetaLogo.tsx`. Para la deshabilitación cruzada no hacen falta props: se les pone
   `mutationKey: ['configuracion', ...]` a las tres mutaciones (guardar, cambiar y quitar), y cada lado deshabilita con
   `useIsMutating({ mutationKey: ['configuracion'] }) > 0`. La página no cambia. Los tests de la Card pueden quedarse en la página, porque son
   de integración, y solo los de deshabilitación cruzada y `keepDirtyValues` necesitan el formulario.
   **Qué se gana:** la página vuelve a ser solo el formulario, el estado del logo queda en un solo lugar y el acople pasa a ser una clave en
   lugar de variables compartidas.

3. **El foco depende de un efecto con `mensajeLogo` en las dependencias, y solo se ocupa de «Quitar»** (media).
   El efecto `:68-73` se vuelve a correr porque `setMensajeLogo` cambia «en el mismo momento» que termina la mutación (`:67`). Funciona por el
   orden del render, no por diseño. Además `enfocarCambiar` solo se activa al quitar con éxito (`:99`). Al cambiar el logo, «Cambiar logo» queda
   `disabled` mientras sube (`:161`). Al quitar con error, el `ConfirmDialog` ya devolvió el foco a «Quitar logo», que también queda `disabled`.
   En los dos casos el foco depende de cómo trata el navegador un elemento que se deshabilita con el foco: o se queda ahí, o cae a `body` por la
   regla de *focus fixup*. No lo verifiqué; jsdom no lo modela. El criterio 8 pide que el foco vuelva al botón.
   **Alternativa:** un solo efecto atado a la transición `logoOcupado: true → false`, sin flag ni `mensajeLogo`:
   `useEffect(() => { if (antes.current && !logoOcupado) botonCambiarRef.current?.focus(); antes.current = logoOcupado }, [logoOcupado])`.
   Cubre cambiar y quitar, con éxito o con error, porque «Cambiar logo» siempre existe. Test: `toHaveFocus()` después de un cambio exitoso y de un error.
   **Qué se gana:** una regla sola y explícita en lugar de una que depende del orden del render, y el caso «Cambiar» queda cubierto.

4. **`staleTime: 60_000` en `useConfiguracion` es un parche de test que repite el valor global** (baja).
   `useConfiguracion.ts:9-11` usa el mismo valor que `AppProviders.tsx:9`, así que en producción no cambia nada: los cambios de otro admin ya
   tardaban lo mismo en verse, y `setQueryData` marca la caché como fresca de todos modos. No afecta «Cambios guardados». Solo cambia el
   comportamiento en los tests, porque `crearQueryClient` (`src/test/utils.tsx:9`) no fija `staleTime`. Así `ConfiguracionPage.test.tsx:96`
   (`toHaveBeenCalledTimes(2)`) no ve la consulta de más cuando `LogoInstitucional` monta un observer nuevo. El comentario le atribuye un efecto
   en producción que no tiene, y si alguien cambia el valor global este queda pegado sin que se note.
   **Alternativa:** quitar la línea y ajustar la aserción del test: contar las llamadas antes de «Reintentar» y comprobar que aumentaron.
   **Qué se gana:** un solo lugar decide la frescura, y el test prueba lo que dice («Reintentar vuelve a consultar»).

5. **`keepDirtyValues` deja los campos marcados como sucios después de «Guardar»** (baja). En RHF 7.89, con `keepDirtyValues` y sin
   `keepDefaultValues`, `_reset` conserva `_formState.dirtyFields` (`node_modules/react-hook-form/dist/index.esm.mjs:3483-3486`) y vuelve a
   poner el valor del formulario en cada campo sucio (`:3387-3388`). Después de guardar, los campos editados siguen sucios. El reset que dispara
   `setQueryData` no les pone lo que quedó en la base. Por ejemplo, `nombre`, `facebook` e `instagram` siguen mostrando los espacios que zod
   recortó al enviar, y ningún reset posterior (cambio de logo, recarga) los toca hasta que se vuelvan a editar. Lo que el admin escribió no se
   pierde en ningún caso: el criterio se cumple.
   **Alternativa:** en `onSubmit`, después del `mutateAsync` exitoso, `reset(fila)` con la fila que devuelve la mutación. `reset()` directo no
   aplica `resetOptions` (`:3509`), así que deja los campos limpios. Test: guardar `"  X  "` en el nombre y comprobar que el campo muestra `"X"`.
   **Qué se gana:** después de guardar, el formulario muestra lo que tiene la base y vuelve a seguir los cambios.

6. **El formato del logo se calcula tres veces y dos funciones lanzan** (baja). `formatoDe` se llama en `validarLogo`, `rutaNueva` y
   `mimeDeLogo` (`archivos.ts:27-45`). Las dos últimas lanzan si nadie validó antes, y `consultas.subirLogo` importa un módulo puro para sacar
   el MIME (`consultas.ts:3,40`). El molde de recursos es otro: `secuencias.datosDeArchivo` resuelve el formato una vez y `consultas.subirArchivo`
   recibe el `mime` (`recursos/secuencias.ts:16-21,35`). Responde la pregunta 5: sí, `cambiarLogo` se puede llamar sin `validarLogo`. Hoy da el
   mensaje genérico, porque el `throw` de `rutaNueva` sale como rechazo de la promesa, sin subir nada.
   **Alternativa:** exportar `formatoDeLogo(file)` y que `cambiarLogo` haga `const f = formatoDeLogo(file); if (!f) throw new Error(MOTIVO_FORMATO)`,
   después `rutaNueva(f.ext)` y `subirLogo(ruta, file, f.mime)`. Se va `mimeDeLogo`.
   **Qué se gana:** un solo punto que decide el formato, `consultas.ts` queda solo con supabase y desaparece un `throw` duplicado.

7. **`storage:limpiar` toma «sin fila de configuración» como «ningún logo referenciado»** (baja). `limpiar-storage.ts:82` hace `select('logo_ruta')`
   sin `.single()`. Si la consulta devuelve `[]` sin error, todo el bucket `logo` sale huérfano, y `referencias.test.ts:35-38` lo fija como
   comportamiento esperado. Es improbable, porque la fila tiene `CHECK id = 1` y nadie la borra, pero va contra la falla cerrada del script. Lo
   demás está bien: un error de lectura lanza antes de planificar (`:83`, `:101`, `main().catch` → salida 1), y una ruta referenciada nunca es
   huérfana (`planificar.ts:48-50`).
   **Alternativa:** `.select('logo_ruta').eq('id', 1).single()`: una fila de menos da error y no se borra nada. Con eso, `armarReferencias`
   recibe `logo_ruta: string | null`, y el caso «sin la fila» del test sobra. Si se quiere menos, se puede devolver el armado al lugar donde
   estaba en `leerReferencias` y borrar `referencias.ts` y su test: era un literal de 4 líneas.
   **Qué se gana:** la falla cerrada cubre también el bucket nuevo.

8. **El nombre con su respaldo está copiado en tres lugares** (baja). `config?.nombre || 'Sitio institucional'` aparece en `PublicHeader.tsx:18`,
   `PublicFooter.tsx:7` y `AdminSidebar.tsx:37`. Cada uno llama a `useConfiguracion` además del `useLogo` interno de `LogoInstitucional`.
   **Alternativa:** que `useLogo()` devuelva también `nombre`, ya con el respaldo, como proponía el punto 7 de la crítica de la spec, y que los
   tres layouts usen solo `useLogo`.
   **Qué se gana:** un solo lugar para el texto por defecto y para sacar las iniciales.

9. **Favicon: el código que crea el `<link>` no se usa en producción** (baja). `Favicon.tsx:15-20` crea el `<link>` si falta, pero `index.html:6`
   siempre lo trae. Así quedan 5 líneas y un test (`Favicon.test.tsx:104-111`) para un caso que no ocurre.
   **Alternativa:** `document.head.querySelector('link[rel="icon"]')?.setAttribute('href', …)` y borrar ese test.
   Lo demás está bien:
   - sin `type` es lo correcto: el navegador toma el formato del `Content-Type`, que Vite y Storage mandan bien;
   - no hace falta limpiar al desmontar, porque nunca se desmonta;
   - está en `AppProviders`, fuera de `AuthProvider`, así que cubre el login;
   - mientras carga no toca nada, y si falla deja el estático.

   Un límite para anotar en `arquitectura.md`: si la URL del logo da 404, el `<img>` cae a las iniciales, pero la pestaña muestra el ícono
   genérico del navegador y no `favicon.svg`.

## Desvíos que reportó el implementador
- **`<link rel="icon">` sin `type`:** aceptable. Es lo que pedía la crítica de la spec (punto 8).
- **`PublicHeader.tsx` editado por shell:** el hook de formato es solo `oxlint --fix` (`.claude/hooks/formatear.mjs`), sin formateador. El diff
  solo quita el `span` y dos imports, y `cn` sigue en uso (`:35`, `:73`). Para cerrarlo alcanza con que el agente principal corra `npm run lint`;
  yo no pude.
- **Input propio en lugar de `FileDropzone`:** aceptable. `FileDropzone` es una zona de arrastre con etiqueta y texto de ayuda, y metería una
  caja grande en una Card que ofrece un botón «Cambiar logo». El `aria-label` del input oculto no llega a nadie, porque con `display: none` no
  está en el árbol de accesibilidad, pero no molesta.
- **«Sitio institucional» en `AdminSidebar`:** aceptable y coherente con el encabezado y el pie. Ver el punto 8 para no repetirlo.

## Revisados sin cambios
- **Secuencias (0016):** el orden es subir → UPDATE condicional → borrar el anterior. `compensar` borra solo ante un rechazo con `code`, y
  `borrarOAvisar` maneja el anterior; los tests cubren la red, `PGRST116` y una compensación que falla. `.is('logo_ruta', null)` es necesario
  (`.eq(…, null)` sería `= null` y nunca coincidiría) y tiene su test en `consultas.test.ts:77`. Con dos admins a la vez, el segundo recibe
  `PGRST116` y su subida se borra; un «Guardar» del otro no toca `logo_ruta`.
- **`LogoInstitucional`:** usa `useLogo` y no llama a `consultas`, como pide `react.md`. `urlRota` guarda la URL y no un booleano, así que un
  logo nuevo vuelve a intentar sin un efecto. El `key={url}` sobra pero no hace daño. Mientras carga deja la caja con el mismo tamaño fijo, y el
  `<img>` usa `object-contain` sin `rounded-full`. Es decorativo (`alt=""`) en los layouts y lleva `alt` en la vista previa.
- **Migración y pgTAP:** cumple `migraciones.md`: migración nueva, `add constraint` con nombre explícito y políticas solo para `authenticated` +
  `es_admin()`, sin update. `logo.test.sql` prueba el CHECK con los casos límite (`.jpeg`, `.PNG`, el uuid en mayúsculas, una carpeta, la
  cadena vacía y NULL), el bucket, cada política (anon, sin marca y admin; el delete sin marca con `allow_delete_query` y el select temporal) y el
  UPDATE condicional. No hay trampa con `jpeg`/`jpg`: el bucket valida el MIME (`image/jpeg`) y no la extensión, y la ruta siempre termina en `.jpg`.
- **Bundle:** no hay dependencias nuevas. `School` ya venía de lucide.

## Respuesta (crítica del código, junto con `revision.md`)

Una sola ronda por fase. Las altas y medias entran en el corte; las bajas, a `notas.md` salvo las triviales o las que tocan algo destructivo. Todo cabe en los archivos de la feature: ninguno agranda el alcance. Coinciden crítico y revisor en tres hallazgos (foco tras «Cambiar logo», sin invalidar tras `PGRST116`, la caché vieja), lo que los vuelve prioritarios.

1. **Acepto (crítico del revisor).** El favicon deja de seguir al logo después de iniciar sesión en la SPA: `AuthContext.tsx:49` hace `queryClient.clear()` al cambiar el usuario, y `<Favicon />` queda mirando una query que ya no está en la caché; la de `ConfiguracionPage` es otra, y el `setQueryData` de las mutaciones actualiza esa. Es el flujo principal (login → Configuración → cambiar logo) y los tests de `Favicon` nunca llaman a `clear()`. Arreglo: `Favicon` se monta dentro de `AuthProvider` y se reengancha con `key` por el usuario. Test: con logo, `client.clear()`, luego `setQueryData(['configuracion'], …)` con otro `logo_ruta` y esperar que cambie el `href`. Qa lo confirma en el navegador después de `loginAdmin`.
2. **Acepto (crítico, punto 1; revisor, importante).** Tras `PGRST116` el reintento falla siempre: la caché conserva el `anterior` viejo. `useCambiarLogo` y `useQuitarLogo` invalidan `['configuracion']` en `onSettled`/`onError` (`rules/datos.md`), y el mensaje deja de pedir «recargá» (que borraría lo escrito sin guardar): «El logo cambió en otra sesión: ya mostramos el actual. Probá de nuevo.». Test: un `PGRST116` vuelve a llamar a `obtenerConfiguracion`.
3. **Acepto (crítico, punto 3; revisor, importante).** El foco: un solo efecto atado a la transición `logoOcupado: true → false` que enfoca «Cambiar logo» (cambiar y quitar, con éxito o con error), sin el flag ni el efecto con `mensajeLogo` en las dependencias. Tests `toHaveFocus()` tras un cambio exitoso y tras un error.
4. **Acepto (crítico, punto 2).** La Card del logo pasa a `features/configuracion/components/TarjetaLogo.tsx`; la deshabilitación cruzada con «Guardar» se resuelve con `mutationKey: ['configuracion', …]` en las tres mutaciones y `useIsMutating({ mutationKey: ['configuracion'] })` de cada lado. La página vuelve a ser solo el formulario. Los tests de `ConfiguracionPage` (que prueban por la página) son la red de seguridad y no se debilitan.
5. **Acepto (crítico, punto 5).** `keepDirtyValues` deja `nombre` y las redes con los espacios que zod recortó después de «Guardar»: `reset(fila)` tras el `mutateAsync` exitoso, con test que guarda `"  X  "` y comprueba `"X"`.
6. **Acepto (crítico, punto 7; destructivo).** `limpiar-storage.ts:82` toma «sin fila de configuración» por «ningún logo referenciado» y marcaría todo el bucket `logo` como huérfano. `.eq('id', 1).single()` para que falle cerrada, y se ajusta `referencias.test.ts:35-38`.
7. **Acepto (crítico, punto 9, parte documental).** Si la URL del logo da 404, la pestaña muestra el ícono genérico del navegador y no `favicon.svg`: se anota en `docs/arquitectura.md`.
8. **A `notas.md` (bajas).** `staleTime: 60_000` en `useConfiguracion` (parche de test sin efecto en producción: es el valor global; quitarlo y contar las llamadas antes de «Reintentar»); `formatoDeLogo` calculado tres veces y `consultas.ts` que importa `archivos`; `config?.nombre || 'Sitio institucional'` copiado tres veces (que `useLogo()` devuelva `nombre`); la rama de `Favicon` que crea el `<link>` y nunca se usa en producción; `referencias.ts` existe para un literal de 4 líneas.
9. **Pendiente del coordinador.** `npm run lint` sobre `PublicHeader.tsx` (editado por shell) y `npm run build`: los corro yo.
