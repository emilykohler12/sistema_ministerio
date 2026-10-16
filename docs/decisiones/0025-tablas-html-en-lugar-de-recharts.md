# 0025 · Tablas HTML con barras CSS en lugar de recharts

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
El dashboard era el único lugar donde se usaba recharts (un gráfico de barras por localidad y una línea por fecha).
En el corte dashboard, nivel, cargo, ranking y localidad ya pasaban a tablas HTML. La serie temporal habría necesitado además una tabla
`sr-only` para cumplir WCAG 2.2 AA. `ResponsiveContainer` mide 0×0 en jsdom, así que el gráfico no se podía testear.

## Opciones consideradas
- **Mantener recharts para la serie:** se ve mejor, pero obliga a mantener dos representaciones de los mismos datos y deja un componente sin test.
- **Tabla HTML con una barra CSS por fila:** la misma estructura que el resto del tablero. Es accesible sin duplicar nada y se puede testear.

## Decisión
- Todas las visualizaciones del tablero son tablas HTML con barras CSS (`aria-hidden`). Se ejecutó `npm uninstall recharts`.
- §8 de la definición dice ahora "Tablas HTML con barras CSS".
- Una librería de gráficos vuelve solo si un indicador validado (C-11) no se puede leer como tabla.

## Consecuencias
- Hay una dependencia menos y un bundle más chico, y toda la UI del tablero se verifica en Vitest.
- Con muchos puntos (30 días en el celular) la tabla queda larga. Las tablas anchas se desplazan dentro de su tarjeta (`overflow-x-auto`).
