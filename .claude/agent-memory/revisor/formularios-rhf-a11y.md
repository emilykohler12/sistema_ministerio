---
name: formularios-rhf-a11y
description: Huecos de accesibilidad y de limpieza de errores en formularios RHF + zod del DAM (setError en varios campos, aria-describedby faltante); cómo probar RHF en el scratchpad
metadata:
  type: project
---

En pendientes-app (2026-10-10), `NormativaFormPage` marcó el 23505 en número y año con `setError`, pero:
- Los `Input` no tenían `aria-describedby` (el `Input` compartido solo pone `aria-invalid`). El año quedó `aria-invalid` con
  `message: ''` y sin descripción accesible; el `role="alert"` de `FieldError` se anuncia una vez y nada más. `EstablecimientoFormPage`
  sí lo hace bien (`aria-describedby={errors.x ? 'x-error' : undefined}`): es el molde.
- Un error de par puesto con `setError` en dos campos se limpia por separado. Tras el submit (reValidateMode `onChange`), editar
  un campo limpia solo ese; el otro queda inválido hasta reintentar. El reintento sí limpia todo (handleSubmit vuelve a correr el resolver),
  así que no bloquea el envío. Pedí `clearErrors([a, b])` al cambiar cualquiera y un test de "corregir y reintentar".
- Pantallas públicas que leen `useConfiguracion()` (`ContactoPage`) mostraban el estado vacío ("Todavía no hay datos") ante un
  error de carga: es la misma familia que [[supabase-js-frontend]] (rama `isError` faltante).

Se repitió en descargas (2026-10-10, `DescargaModal`): cinco `Select`/`Input` con `FieldError` con id y sin `aria-describedby`. Es el hueco más
recurrente de UI del proyecto: buscalo siempre (`grep -n "aria-describedby"` en el formulario nuevo).

**Promovido a regla (2026-10-16):** `aria-describedby` hacia el `FieldError` y `clearErrors([a, b])` para errores de par están en
`.claude/rules/react.md`. Verificá que se cumplan y citá la regla; queda acá el detalle y cómo probar RHF.

En instituciones-sin-vincular (2026-10-18) el resultado de una acción iba en `{msg && <p role="status">}`: la región viva se monta con el texto
(no se anuncia de forma confiable) y en el mismo commit el foco salta al `h1`. El test solo comprobaba que el nodo existiera. Pedí el contenedor
siempre montado y el test con el mismo nodo antes y después. Buscalo con `grep -n 'role="status"'` en pantallas nuevas.
Se repitió en cierre-inactividad (2026-10-23): el mensaje "Tu sesión se cerró por inactividad" de `LoginPage` es `{cond && <p role="status">}` montado
con la página y sin mover el foco. Segunda vez: proponé sumarlo a `rules/react.md` (región viva siempre montada, o `role="alert"` si aparece con la pantalla).
En la misma revisión: `Dialog` tiene `id="dialog-title"`/`dialog-description` literales y `useFocusTrap` escucha `keydown` en `document`. Con dos diálogos
abiertos (un aviso global sobre un diálogo del panel), el de arriba toma el nombre del de abajo y Escape cierra los dos. Revisalo en todo modal global.
Se arregló con `useId` y una pila de tokens de módulo en `useFocusTrap` (Revisión 2). Dos trampas en una pila así: (a) cuando el de **abajo** se cierra
primero (`DialogoRecurso` se cierra solo al terminar `onSubmit`), su cleanup hace `previouslyFocused.focus()` y saca el foco del de arriba. Solo el
de arriba debería restaurar el foco, y el de abajo le pasa su destino. (b) Un test de "sale de la pila aunque no sea la de arriba" que desmonta la de
arriba antes del Escape es vacuo: pasa con `pop()` y con un token huérfano. Pedí tres trampas (desactivar la del medio, Escape llega a la de arriba;
desmontar esa, Escape llega a la de abajo).
También se repite: un test de "carga" que solo comprueba ausencias. `TableSkeleton` no tiene `role`, así que si se saca, el test sigue verde.

En redes-contacto (2026-10-23, `ContactoPage`) las URL de Facebook/Instagram como texto del enlace dentro de `DatoDeContacto` (flex sin
`min-w-0`, sin `break-all`): una URL larga desborda a 320 px (WCAG 1.4.10). Buscalo en toda tarjeta que muestre URL o correo como texto.
Las redes de `configuracion` se validaron en #43 (validar-redes, 2026-10-23): `trim` + `https://`. Ahí se escapó `"https://"` solo
(el `refine` era `startsWith`), cuando `DialogoRecurso` ya exige `length > 'https://'.length`. En toda validación "empieza con https://" probá
el prefijo pelado.
`lucide-react` 1.x no trae íconos de marca (Facebook/Instagram): `Globe` es lo esperado.

**Why:** el foco de a11y del proyecto pide que todo `aria-invalid` tenga explicación, y los estados vacíos no deben mentir ante un error.
**How to apply:** en cada `setError` revisá que el input tenga `aria-describedby` hacia un mensaje existente; si el error abarca varios
campos, mirá cómo se limpia. La receta de probar RHF con un test en el scratchpad ya no corre: el perfil checks bloquea el Write fuera
del proyecto (ver [[hooks-frontmatter-no-invocados]]). Razoná leyendo el código y pedí el test al implementador.
