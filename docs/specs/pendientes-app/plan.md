# Plan: pendientes de la app (carril chico)

**Objetivo:** cerrar tres bugs chicos y la alerta de `npm audit`. Rama `fix/pendientes-app`.

1. **`/contacto` lee la configuración** (`src/pages/public/ContactoPage.tsx`): `useConfiguracion()` y mostrar `telefono`, `correo` y
   `direccion`, solo los que tengan valor (como `PublicFooter`), con `tel:` y `mailto:`. Mientras carga, `Skeleton`. Si no hay ninguno,
   un texto "Todavía no hay datos de contacto". El subtítulo usa `config.nombre`. Se va el texto de CABA.
2. **Normativa duplicada marca los campos** (`src/features/normativas/errores.ts`, `src/pages/admin/normativas/NormativaFormPage.tsx`):
   `esNormativaDuplicada(error)` (puro, `23505`). Ante ese error, el formulario hace `setError` en número y año (`aria-invalid`, el
   mensaje bajo el número) y no muestra el alerta general. El resto de los errores sigue igual. Mismo patrón que `EstablecimientoFormPage`.
3. **Keys únicas en `Breadcrumb`** (`src/shared/components/ui/Breadcrumb.tsx`): key por posición (`${i}-${label}`). Hoy una categoría y
   un taller con el mismo nombre repiten la key (aviso en el e2e de talleres).
4. **`npm audit fix`** (`source-map-js`, solo `package-lock.json`). Sin `--force`.

**Tests primero:** `ContactoPage.test.tsx` (datos de la configuración, campos vacíos ocultos, sin CABA), caso 23505 en
`NormativaFormPage.test.tsx` y `errores.test.ts`, y `Breadcrumb.test.tsx` con dos labels iguales (sin `console.error`).

**Verificación:** `npm test`, lint, typecheck, build y `npm audit` en 0. Revisor, y `qa` porque toca pantallas (contacto y normativas),
con `db:reset` antes y después.

**Fuera de alcance:** logo, redes en `/contacto` y otros mensajes de error.
