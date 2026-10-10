# QA 1

## Veredicto
Funciona

## Qué probé
- /contacto con datos cargados por el admin: teléfono (`tel:` sin espacios), correo (`mailto:`) y dirección; sin "Pizzurno" ni "CABA" — pasó
- Editar el teléfono en /admin/configuracion y recargar /contacto muestra el nuevo — pasó
- Normativa duplicada (mismo número y año): número y año `aria-invalid`, mensaje "Ya existe una normativa con ese número y año." y sin alerta general; al cambiar el número se limpian ambos y guarda y vuelve a la lista — pasó
- Breadcrumb con categoría y taller del mismo nombre (RecursosPage): sin aviso "same key" en la consola — pasó

## Bugs
Ninguno.

## Observaciones
- El footer repite teléfono y correo, por eso los selectores de /contacto se acotan a `#main-content`.
- El test de breadcrumb corre contra el dev server; no comprobé que falle sin el fix (no se toca `src/`).

## Evidencia
`npm run test:e2e`: 25 pasados, 0 fallados. e2e nuevos: `normativas-admin.spec.ts` (duplicado), `auth-configuracion.spec.ts` (contacto), `talleres-admin.spec.ts` (breadcrumb).
