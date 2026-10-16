---
name: trampas-dashboard
description: Trampas del e2e del tablero /admin (regiones, deltas, regex con tildes, hook qa)
metadata:
  type: project
---
- El tablero acumula datos de otros specs: medir línea base (KPI "Descargas", aviso, fila de hoy) y comparar deltas, no absolutos.
- KPIs: `getByRole('region',{name:'Resumen'}).getByText(etiqueta,{exact:true}).locator('xpath=following-sibling::p')`. Secciones: `getByRole('region',{name:'Ranking de talleres'})` etc.
- Regex del aviso: "instituciones" no matchea `institución(es)?`; usar `/instituci(ón|ones) sin vincular/`.
- Texto de una fila concatena celdas sin espacio ("20241"): usar `getByRole('cell').last()`.
- Hoy en la serie: dd/m/aaaa sin ceros (es-AR), fecha en America/Argentina/Buenos_Aires.
- Token de sin-permiso: fetch `/auth/v1/token?grant_type=password` con el apikey capturado de un request `/rest/v1/`.
- El hook de qa bloquea `sed`: editar con Edit/Write.
- Cada descarga en un contexto de navegador nuevo (la visita guarda el formulario en sessionStorage).
