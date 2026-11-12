# Logo institucional

- **Estado:** aprobada
- **Autor:** Emily Kohler + Claude
- **Fecha:** 2026-11-11 (issue #23)

## Objetivo
El Ministerio sube su logo desde el panel y se ve en el portal, en el panel y en la pestaña del navegador. Hoy `logo_ruta` queda en NULL y todo muestra un círculo con las iniciales «MD».

## Criterios de aceptación
1. Dado que no hay logo, cuando se abre el portal o el panel, entonces se ve lo de hoy (círculo con iniciales o el ícono `School`) y la pestaña muestra un favicon neutro (hoy es el rayo de Vite).
2. Dado un PNG, JPG o WebP de hasta 2 MB, cuando el admin pulsa «Cambiar logo» y lo elige, entonces se sube, se actualiza la fila y se borra el logo anterior; el encabezado, el pie, la barra del panel y el favicon lo muestran sin recargar. Si falla solo el borrado del anterior, el cambio se informa como hecho y queda un huérfano. Si otro admin cambió el logo mientras, falla con un error y hay que reintentar. Lo que el admin estaba escribiendo en el formulario sin guardar no se pierde.
3. Dado un archivo de otro formato o de más de 2 MB, entonces el panel lo rechaza con un mensaje claro sin subir nada; si lo rechaza el servidor (413 o 415) se muestran los mismos mensajes.
4. Dado que hay logo, cuando el admin pulsa «Quitar logo» y confirma, entonces la fila vuelve a NULL, se borra el archivo y todo vuelve a las iniciales.
5. Dado un fallo al cambiar el logo (red, rechazo del servidor), entonces se muestra el error, el logo actual no cambia y, si el servidor rechazó el cambio, el archivo recién subido se borra (compensación de 0016). Tras un corte de red puede quedar un huérfano.
6. Dada una imagen que no carga (404, red caída), entonces cada lugar vuelve a las iniciales sin romper el diseño.
7. Dado que hay logo, entonces la pestaña usa esa imagen como favicon; sin logo usa `favicon.svg`. Cambia al cambiar el logo, sin recargar.
8. Accesibilidad: el logo de encabezado, pie y barra lateral es decorativo (`alt=""`, el nombre está al lado); la vista previa del panel lleva `alt`. Los botones se operan con teclado, un único `role="status"` siempre montado anuncia éxito o error, y el foco vuelve al botón que se usó.
9. Seguridad: solo el admin escribe (políticas del bucket y RLS de `configuracion`); cualquiera lee. `logo_ruta` solo admite `<uuid>.png|jpg|webp` o NULL. Se aceptan `.jpg`, `.jpeg` y mayúsculas, y se guarda siempre `.jpg`.
10. `npm run storage:limpiar` también revisa el bucket del logo.

## Diseño
- **Migración nueva** `*_logo.sql`, sin funciones: bucket público `logo` (2 MB; `image/png`, `image/jpeg`, `image/webp`) con políticas de `storage.objects` solo admin (select, insert, delete; molde de normativas) y `CHECK` con nombre explícito en `configuracion.logo_ruta` (`'^[0-9a-f-]{36}\.(png|jpg|webp)$'` o NULL). Tests pgTAP: el `CHECK`, el bucket y las políticas (`storage_global` ya las cubre).
- `features/configuracion/`: `archivos.ts` (puro: `validarLogo` por extensión —`png`, `jpg`, `jpeg`, `webp`, sin distinguir mayúsculas— y tamaño; el MIME sale de la extensión; `rutaNueva()` = `<uuid>.<ext>` con `.jpg` para `jpeg`), `consultas.ts` (`subirLogo`, `borrarLogo`, `urlLogo` con `getPublicUrl`, y `actualizarLogo(nueva, anterior)`: UPDATE condicional `.eq('id', 1).eq('logo_ruta', anterior)` —`.is(…, null)` si no había— con `.select().single()`; si la fila ya no apunta al anterior da `PGRST116`), `secuencias.ts` (`cambiarLogo`: sube → UPDATE condicional → borra el anterior; compensa si el servidor rechaza; `quitarLogo`: UPDATE a NULL → borra), `errores.ts` (413/415), hooks de mutación que hacen `setQueryData` de `['configuracion']`, y `useLogo()` (URL y estado sobre `useConfiguracion`).
- `components/LogoInstitucional` (nuevo, único): tamaño fijo, `object-contain`, sin `rounded-full`; `key={url}` y `onError` que cae a las iniciales/`School`; con la configuración cargando, una caja vacía del mismo tamaño. Lo usan `PublicHeader`, `PublicFooter` y `AdminSidebar`, que pasa a mostrar `config.nombre` en lugar del «Subsecretaría de Educación» fijo.
- `ConfiguracionPage`: el logo va en su **propia `Card` fuera del `<form>`** (con su `role="status"` siempre montado y su diálogo de confirmación; todo `Button` con `type="button"`): vista previa, «Cambiar logo» y «Quitar logo», independientes de «Guardar» y deshabilitados entre sí mientras uno esté pendiente. `input.value = ''` tras leer el archivo; tras «Quitar logo» el foco va a «Cambiar logo». El formulario pasa a `useForm({ values: data, resetOptions: { keepDirtyValues: true } })`. Se reemplaza el test «no ofrece ningún control para cambiar el logo».
- Favicon: `public/favicon.svg` pasa a ser un ícono neutro (el `School`, hoy es el rayo de Vite); `index.html` suma `<link rel="icon" href="/favicon.svg">` y un componente dentro de `AppProviders` (`App.tsx`) cambia solo el `href` de ese `<link>` (sin `type`, sin canvas) cuando hay logo. Vale también para el login, que queda fuera de los layouts.
- `scripts/limpiar-storage.ts`: suma el bucket `logo` y `configuracion.logo_ruta` a las referencias (con su test en `planificar`).
- Documentar en `docs/arquitectura.md`, nota en 0016; sin ADR nuevo.

## Fuera de alcance
- SVG y cualquier formato vectorial; recortar, redimensionar o validar proporciones; un logo distinto por pantalla o por modo.
- Que el favicon sea cuadrado: se usa la imagen tal cual (el hint de la pantalla recomienda un logo cuadrado). Límites aceptados: en cada carga se ve primero el ícono por defecto hasta que llega la configuración; marcadores y buscadores usan el estático; Safari puede no actualizar el ícono en caliente (sin verificar).
- Una RPC para cambiar el logo: alcanza el UPDATE condicional (ver Diseño).
- Correo de recuperación, imágenes de redes sociales y la brecha de «redes sociales en contacto».

## Verificación de punta a punta
1. `npm run db:reset`, entrar como admin → Configuración. Sin logo: iniciales en el portal y en el panel.
2. Escribir algo en «Misión» sin guardar y «Cambiar logo» con un PNG: aparece en la vista previa, en el encabezado y el pie del portal, en la barra del panel y como favicon; el archivo está en el bucket `logo` y lo escrito en «Misión» sigue ahí.
3. Cambiar por un JPG: se ve el nuevo y el PNG anterior ya no está en el bucket.
4. Elegir un `.gif` y un archivo de 3 MB: rechazados con mensaje, sin subir nada.
5. «Quitar logo» y confirmar: vuelven las iniciales y el favicon por defecto; el bucket queda vacío.
6. Cortar la red a mitad de un cambio: el logo anterior sigue; `npm run storage:limpiar` en simulación informa el huérfano.
7. `npm test`, `lint`, `typecheck`, `npm run test:db` y `npm run test:e2e`; después `npm run db:reset`.
