---
name: trampas-e2e
description: Selectores, datos y esperas que funcionan en los specs e2e del DAM
metadata:
  type: project
---
- Filas de tabla: `page.getByRole('row', { name: new RegExp(nombre) })`, luego `getByRole('link'|'button')` dentro.
- Diálogo de confirmación: `page.getByRole('dialog').getByRole('button', { name: ... })` (el botón de la fila comparte nombre).
- Selects: `getByLabel('Localidad').selectOption({ label })`. En el listado de establecimientos "Localidad" es único; ids de localidad: Posadas 58, Oberá 55, Apóstoles 5, Eldorado 34.
- Un estado vacío necesita una entidad que ningún otro test toque (p. ej. Eldorado) y `db:reset` previo.
- Nombres únicos: sufijo de Date.now; CUE único: `9` + dígitos de Date.now.
- `.claude/agent-memory` y `e2e/` se pueden escribir; `npm run db:reset` al terminar siempre.
- No se commitean capturas (0020): los bugs se reportan en texto; para diagnosticar, mirar las de `test-results/` (ignorado).
- TagInput: el placeholder desaparece con la primera etiqueta; usar `page.locator('input[list]')`. Sugerencias = botones con el nombre de la etiqueta.
- Tarjeta de categoría: `getByRole('link',{name,exact:true}).locator('..')` y dentro Editar/Dar de baja/Reactivar. Taller y categoría con nombre igual: evitar (strict mode y key duplicada).
- Recursos: dropzone = `input[type=file]` primero; reemplazo = `getByLabel('Archivo nuevo para <nombre>')`; botones por aria-label `Subir|Bajar|Editar|Eliminar <nombre>`. Heading "Recursos" choca con nombres de taller: usar exact.
- Un spec que falla a mitad deja categorías sueltas: `db:reset` antes de reintentar si se cuentan elementos.
