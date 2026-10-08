# 0008 · Cinco niveles fijos y categoría por nivel

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
La v1 fijaba 3 niveles; el repo tenía 6, incluido el comodín "todos". El referente confirmó que los niveles
son los del repo y que ningún taller se comparte entre niveles.

## Opciones consideradas
- **Categoría pertenece a un nivel; taller a una categoría (v1).** Simple, coincide con la navegación actual.
- **Categorías globales + `taller_nivel` N:M.** Solo vale si hay talleres multinivel; obliga a rehacer la navegación.
- **Seudonivel "todos".** Comodín que complica cada consulta y no cubre "dos niveles".

## Decisión
Primera opción, con tabla `nivel_educativo` (`id`, `nombre`, `orden`) y 5 valores: Inicial, Primario,
Secundario, Terciario y Formación profesional. Se elimina "todos". El nivel del taller se deriva de su categoría.

## Consecuencias
- Se quita `nivel` duplicado en `Taller` y el comodín de `useCategorias.ts`.
- Categoría única por nombre normalizado dentro de su nivel.
- Si aparecieran talleres multinivel, se revisa esta decisión antes de duplicarlos.
