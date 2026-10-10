# QA 1 (panel admin)

## Veredicto
Funciona

## Qué probé
- Archivo `.exe`: alerta "Formato no admitido. Subí un PDF, PPTX, DOCX, imagen ... o MP4", sin recurso creado — pasó
- Subir un PDF (generado en el test): aparece con tipo PDF — pasó
- Enlace de YouTube; URL `http://` rechazada con "Ingresá una URL que empiece con https://" — pasó
- Reordenar con "Subir" (persiste tras recargar) — pasó
- Renombrar — pasó
- Reemplazar el PDF: cambia el tamaño, conserva nombre y posición — pasó
- Portal anónimo `/talleres/:id` (taller publicado): sección Recursos, nombre del PDF, iframe `youtube-nocookie.com`, "Tamaño total" — pasó
- Eliminar con confirmación: desaparece del panel y del portal — pasó

## Bugs
Ninguno.

## Observaciones
- No probé "Ver" (enlace firmado), el tope de 50 MiB ni la subida de varios archivos a la vez.
- No verifiqué en Storage que el archivo anterior se borre al reemplazar o eliminar (solo la UI).

## Evidencia
`npm run test:e2e`: 22 passed.
