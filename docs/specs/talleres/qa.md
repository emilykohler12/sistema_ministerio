# QA 1 (retroactivo): portal público

## Veredicto
Funciona

## Qué probé (`e2e/portal.spec.ts`, datos creados por la UI del panel)
- Un taller publicado aparece en `/talleres` y uno en borrador no — pasó
- Filtro por nivel (Secundario lo oculta, Inicial lo muestra) — pasó
- Búsqueda por etiqueta y sin resultados ("No encontramos talleres") — pasó
- Detalle `/talleres/:id` del publicado — pasó
- Borrador por URL directa muestra "Taller no encontrado" — pasó
- Home y `/contacto` cargan — pasó

## Bugs
Ninguno.

## Observaciones
- No probé recursos/descarga del detalle ni el filtro "Destinado a" (el filtro de nivel y la búsqueda sí).
- `/contacto` tiene datos fijos (ver `auth-configuracion/qa.md`).

## Evidencia
`npm run test:e2e`: 16 passed.

# QA 2 (panel admin)

## Veredicto
Funciona

## Qué probé
- Alta de taller: el formulario vacío no guarda; con destinatario y etiqueta sugerida (de otro taller) más una nueva, guarda y navega a `.../recursos` — pasó
- Lista de la categoría: estado Borrador y destinatario visibles — pasó
- Edición: Borrador a Publicado y renombrar; aparece en `/talleres` sin sesión — pasó
- Dar de baja con confirmación: pasa a Inactivo y desaparece del portal — pasó
- Con la categoría dada de baja, "Reactivar" el taller muestra "La categoría está dada de baja: reactivala primero" (DA002) — pasó

## Bugs
Ninguno.

## Observaciones
- Si la categoría y el taller se llaman igual, React avisa en consola de dos hijos con la misma `key` (probablemente el `Breadcrumb` usa `label` como key). Es menor y solo aparece con nombres repetidos.

## Evidencia
`npm run test:e2e`: 22 passed.
