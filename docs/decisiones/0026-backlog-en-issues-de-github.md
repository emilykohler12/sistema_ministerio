# 0026 · Backlog y reparto del trabajo en issues de GitHub

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
Somos dos personas, cada una con su sesión del agente principal, y las sesiones no comparten memoria. El "qué sigue" se le preguntaba
al agente, y el backlog real estaba disperso entre Brechas de `arquitectura.md` y las conversaciones. Nada decía quién estaba haciendo qué,
así que las dos podían empezar la misma tarea o tocar las mismas piezas (migraciones, ADR, `database.ts`).

## Opciones consideradas
- **Issues + Project de GitHub:** el repo ya está ahí; la asignación funciona como aviso, el PR cierra el issue y el agente lo lee con `gh`.
  Exige `gh auth login` en cada contenedor.
- **Trello (conector MCP):** tablero cómodo, pero separado de ramas y PR, y el conector depende de la cuenta de una sola persona.
- **`docs/backlog.md` en el repo:** sin configuración, pero "lo tomé" no se ve hasta el push y las dos editan el mismo archivo.

## Decisión
Issues de GitHub como única fuente del backlog. Asignarse el issue antes de crear la rama; la rama sigue siendo `feat/<slug>` sin número
(el hook `contexto.mjs` busca `docs/specs/<slug>/`) y el PR lleva `Closes #<n>`. Etiquetas `carril:*`, `area:*`, `esperando-ministerio`,
`necesita-decision` y `posterior`. La skill `/siguiente` muestra lo libre y lo tomado y recomienda una tarea sin choque por área.
`/decision` toma el número de ADR mirando `origin/main`.

## Consecuencias
- Brechas de `arquitectura.md` sigue describiendo el sistema; el trabajo pendiente se sigue en los issues.
- El agente no sabe de la otra persona salvo por GitHub: si alguien no se asigna, el sistema no lo detecta.
- Las migraciones paralelas exigen rebase y `db:reset`; `database.ts` se regenera y no se resuelve a mano.
