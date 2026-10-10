# QA 1 (panel admin)

## Veredicto
Funciona con observaciones

## Qué probé
- `/admin/talleres` lista los niveles y lleva a las categorías — pasó
- Alta de categoría en Secundario — pasó
- Duplicado normalizado ("  SALUD MÉNTAL ... ") en el mismo nivel: mensaje "Ya existe una categoría con ese nombre en este nivel (puede estar dada de baja)" y no guarda — pasó
- Mismo nombre en otro nivel — pasó
- Edición (nombre) — pasó
- Baja con confirmación: marca "Inactiva"; reactivación — pasó
- Baja con un taller en borrador: "No se puede dar de baja: tiene 1 taller en borrador o publicado" (DA001), la categoría sigue activa — pasó
- Nivel y categoría inexistentes: "Nivel no encontrado" / "Categoría no encontrada" — pasó

## Bugs
Ninguno.

## Observaciones
- El error DA001 se muestra con el `ErrorFallback` grande (ícono + recuadro) arriba de la grilla, ocupa mucho espacio y no indica de qué categoría es el error.
- Con varias categorías en el nivel, el mensaje DA001 no se limpia solo hasta otra acción (no lo verifiqué a fondo).

## Evidencia
`npm run test:e2e`: 22 passed.
