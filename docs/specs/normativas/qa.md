# QA 1 (retroactivo): parte pública

## Veredicto
Funciona

## Qué probé (`e2e/portal.spec.ts`)
- Alta por la UI del panel con un PDF mínimo generado en el test; `/normativas` la lista con número, año, etiqueta y botón "Descargar" — pasó
- Búsqueda por número y por título sin tildes/mayúsculas; sin resultados muestra "No encontramos normativas" — pasó
- El enlace de descarga apunta a un `.pdf` — pasó (no abrí el archivo ni verifiqué el contador de descargas)

## Bugs
Ninguno.

## Evidencia
`npm run test:e2e`: 16 passed.

# QA 2 (panel admin)

## Veredicto
Funciona

## Qué probé
- Alta con PDF: aparece en la tabla con número y año — pasó
- Sin PDF no guarda (queda en el formulario) — pasó
- Número duplicado con otra capitalización y espacios, mismo año: "Ya existe una normativa con ese número y año." — pasó
- Mismo número en otro año — pasó
- Edición sin archivo y con archivo nuevo — pasó
- Baja: cancelar no borra; confirmar la quita de la tabla — pasó

## Bugs
Ninguno.

## Observaciones
- El mensaje de duplicado aparece al pie del formulario, debajo del dropzone y fuera de vista sin scroll en pantallas bajas; el campo Número no se marca.
- No verifiqué el contador de descargas ni que el PDF viejo se borre de Storage.

## Evidencia
`npm run test:e2e`: 22 passed.
