# QA 1

## Veredicto
Funciona

## Qué probé (`e2e/padron.spec.ts`, Chromium contra Supabase local)
- Sin localidad se pide elegir; Eldorado (vacía) muestra estado vacío con "Nuevo establecimiento"; la URL lleva `?localidad=34` — pasó
- Alta con CUE en Posadas, aparece en el listado; búsqueda sin tildes ("nandu") y por CUE; búsqueda sin resultados — pasó
- Nombre duplicado (mayúsculas, tildes y espacios) y CUE duplicado marcan su campo, al crear y al editar; CUE "12a" rechazado en el formulario — pasó
- Editar cambiando la localidad (Posadas a Apóstoles) vuelve a `?localidad=5` con el establecimiento — pasó
- Baja con confirmación muestra "Inactivo"; Reactivar lo quita — pasó
- `/admin/establecimientos/99999999999/editar` y `/abc/editar` muestran "no encontrado" — pasó

## Bugs
Ninguno.

## Observaciones
- Con un nombre duplicado, el valor del campo queda con los espacios que escribió el usuario (no se recorta en pantalla); es cosmético.
- El test del estado vacío usa Eldorado y asume que nadie la carga: si se corre el script de la fase B con datos en Eldorado, hace falta `npm run db:reset`.
- Sin cubrir: criterio 5 en la base y criterios 1, 2 y 6 (los cubre pgTAP); la consulta anon al inactivo (spec paso 5) no se probó en navegador.

## Pendiente para el coordinador
- Fase B, paso 4 (las altas del script aparecen en `/admin/establecimientos`): no lo verifiqué porque correr el script no está en mi perfil. Tras `npm run padron:importar -- scripts/padron/ejemplo.csv --aplicar`, mirar el listado de cada localidad del CSV.

## Evidencia
`npm run test:e2e`: 8 passed (6 de padrón, 2 de smoke).
