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
También se repite: un test de "carga" que solo comprueba ausencias. `TableSkeleton` no tiene `role`, así que si se saca, el test sigue verde.

En redes-contacto (2026-10-23, `ContactoPage`) las URL de Facebook/Instagram como texto del enlace dentro de `DatoDeContacto` (flex sin
`min-w-0`, sin `break-all`): una URL larga desborda a 320 px (WCAG 1.4.10). Buscalo en toda tarjeta que muestre URL o correo como texto.
Los valores de redes de `configuracion` no tienen zod `url()` ni `trim` (issue aparte, #24 fuera de alcance): no lo vuelvas a reportar como nuevo.
`lucide-react` 1.x no trae íconos de marca (Facebook/Instagram): `Globe` es lo esperado.

**Why:** el foco de a11y del proyecto pide que todo `aria-invalid` tenga explicación, y los estados vacíos no deben mentir ante un error.
**How to apply:** en cada `setError` revisá que el input tenga `aria-describedby` hacia un mensaje existente; si el error abarca varios
campos, mirá cómo se limpia. Para probar el comportamiento de RHF sin tocar `src/`: test en el scratchpad con `ln -s` a `node_modules`,
`tsconfig.json` con `jsx: react-jsx` y `vitest run --root <scratch> --environment jsdom` (sin jest-dom; `--dir` falla por `fs.allow`).
