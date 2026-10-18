---
name: trampas-sin-vincular
description: Trampas del e2e de /admin/establecimientos/sin-vincular (headings duplicados, combobox, aviso)
metadata:
  type: project
---
- En celular el header admin repite el `h1`: usar `page.getByRole('main').getByRole('heading', ...)`.
- Tras navegar desde el dashboard, `getByLabel('Localidad')` resuelve a una `section` del tablero que aún no se fue: esperar el heading de main y usar `getByRole('combobox', { name: 'Localidad' })`.
- Aislar datos con una localidad poco usada (Eldorado) y un filtro por localidad; fila por `getByRole('row', {name: regex 'i'})` porque el nombre del grupo sale en minúscula si gana la variante.
- Parar la RPC con `page.route('**/rpc/vincular_institucion')` y una promesa para probar "guardando" / Escape.
- Descarga "Otra" anónima: copiar `descargarOtra` de e2e/sin-vincular.spec.ts (contexto nuevo cada vez).
