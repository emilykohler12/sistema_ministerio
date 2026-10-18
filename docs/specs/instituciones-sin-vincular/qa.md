# QA 1

## Veredicto
Funciona

## Qué probé
Contra el Supabase local, con `e2e/sin-vincular.spec.ts` (Eldorado, para no mezclar con otros specs):
- Punta a punta de la spec: 3 descargas anónimas "Otra" (dos con el mismo nombre en distinta capitalización, una distinta) — pasó.
  El dashboard sube el aviso en 2 y es un enlace a `/admin/establecimientos/sin-vincular`; la pantalla muestra 2 y 1 descargas;
  vincular a un establecimiento existente ("Se vinculó con … (2 descargas)", fila desaparece, foco en el título); crear y vincular
  ("Se creó … 1 descarga"); luego el aviso vuelve a la línea base y "Establecimientos alcanzados" suma 2.
- "Vincular" está deshabilitado hasta elegir un radio — pasó.
- Nombre duplicado en "Crear establecimiento": mensaje con guía a «Vincular» o reactivar, campo con `aria-invalid` — pasó.
- Teclado: el buscador conserva el foco al escribir una frase entera y con "sin coincidencias"; Escape cierra el diálogo — pasó.
- Escape no cierra mientras guarda (RPC frenada), y el foco vuelve al título al terminar — pasó.
- Estado vacío "No hay instituciones sin vincular" (base limpia, mirado en pantalla) y enlace desde `/admin/establecimientos` — pasó.
- Celular 360 px: sin scroll horizontal del documento (la tabla desplaza dentro de su contenedor) — pasó.

## Bugs
Ninguno.

## Observaciones
- En celular el encabezado superior muestra un segundo `h1` con el mismo título que la pantalla (dos `h1` en la página). Es del layout
  admin y afecta a todas las pantallas; no es de esta feature.
- No probé: `DA005` (inactivo u otra localidad) ni el caso "Ya estaba vinculado" por dos admins a la vez, ni el "Reintentar" tras fallar
  la vinculación de un alta (requieren forzar errores; los cubren pgTAP y Vitest). Tampoco el error de carga ni la lista de más de una
  localidad con filtro vacío.
- El test del estado vacío tolera datos previos (muestra el vacío o la tabla); el vacío estricto solo se verificó a mano tras `db:reset`.

## Evidencia
`npm run test:e2e`: 37 passed (3.4 min), incluidos `dashboard.spec.ts` (su `sinVincular()` sigue funcionando con el aviso convertido en enlace)
y los 5 tests nuevos de `e2e/sin-vincular.spec.ts`.
