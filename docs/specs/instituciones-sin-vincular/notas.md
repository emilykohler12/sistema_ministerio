# Notas — instituciones sin vincular

- El test de carga de `SinVincularPage` solo comprueba ausencias, porque `TableSkeleton` no tiene rol. Conviene darle `aria-busy` o un rol al skeleton compartido en un corte transversal.
- El test "el foco no salta" de la página pasa también sin el arreglo de `useFocusTrap`. El que lo cubre de verdad es `useFocusTrap.test.ts`.
- Pendientes de alcance: desvincular, descartar grupos basura, alias automáticos y paginación (tope de 1000 grupos).
- Dos `h1` en celular: el header admin repite el título de la pantalla (layout, todas las pantallas; lo observó el qa).
