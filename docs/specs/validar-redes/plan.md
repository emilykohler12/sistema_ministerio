# Plan: validar las redes sociales de configuración (#43)

**Objetivo:** el admin no puede guardar Facebook o Instagram sin `https://` ni con solo espacios; al guardar se quitan los espacios de los extremos.

**Archivos:** `src/pages/admin/ConfiguracionPage.tsx` y `ConfiguracionPage.test.tsx`. Sin base de datos ni rutas.

**Pasos (test primero):**
1. Tests en rojo: `facebook.com/x` muestra error y no guarda; `"   "` se guarda como `''`; `"  https://facebook.com/x "` se guarda sin espacios; vacío sigue siendo válido; `http://` se rechaza (decisión: solo `https://`, igual que `recurso`).
2. En el zod, un `redSocial` compartido por los dos campos: `trim()` y luego vacío o URL que empiece con `https://` (mensaje: "Ingresá una URL que empiece con https://").
3. Cada campo con error lleva `aria-describedby` hacia su `FieldError` (molde: `EstablecimientoFormPage`).

**Fuera de alcance:** `ContactoPage` y `PublicFooter` (ya muestran solo lo que tiene valor); corregir los valores ya guardados en la base; el logo (#23).

**Verificación:** `npx vitest run src/pages/admin/ConfiguracionPage.test.tsx`, `npm run lint`, `npm run typecheck`, `npm run test:e2e` como regresión y después `npm run db:reset`.
