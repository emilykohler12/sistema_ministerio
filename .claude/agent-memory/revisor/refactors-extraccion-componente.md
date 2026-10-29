---
name: refactors-extraccion-componente
description: Al extraer un componente compartido (RangoFechas, #39), la guarda que queda en el padre suele quedar sin test; cómo verificar "sin cambio visible" con estado local que se mueve
metadata:
  type: project
---

En rango-fechas (#39, 2026-10-27) `RangoFechas` emite `''` y el dashboard lo filtra con `if (desde && hasta)` en `SelectorPeriodo`. Esa guarda, que
el plan pedía explícitamente, no tenía test (ni antes, cuando vivía en la condición del efecto): quitarla manda al tablero a "30 días" y los tests
siguen verdes. Es la misma familia que los asserts vacuos de [[supabase-privilegios-y-tests]] y los tests de carga vacuos de [[formularios-rhf-a11y]].

**Why:** al mover lógica a un componente compartido, el test nuevo cubre el componente genérico y la particularidad de cada consumidor queda huérfana.
**How to apply:** en toda extracción, listá lo que queda en cada padre (adaptadores de `onCambio`, `|| null`, guardas) y buscá un test de página que
falle si se quita. Para juzgar "sin cambio visible" cuando un estado pasa de un componente siempre montado a uno condicional, leé el handler de la
página (p. ej. `elegirTipo` reconstruye el período desde la URL): suele reiniciar el estado igual que antes y el desvío es inofensivo.
