# QA 1

## Veredicto
Funciona

## Qué probé
- Dashboard: columnas «En el período» (penúltima) y «Total histórico» (última) como `columnheader`; ambas celdas en 1 tras una descarga anónima de normativa (`e2e/dashboard.spec.ts`) — pasó
- Admin no cuenta: su descarga y apertura no cambian ni «En el período» ni «Total histórico»; el anónimo sube las dos en 1 junto con el KPI (`e2e/no-contar-admin.spec.ts`) — pasó
- Punta a punta (`e2e/normativas-periodo.spec.ts`, nuevo): alta de normativa desde el panel; ambas columnas en 0; aviso de la sección («Las descargas anteriores a que se registrara el día no entran en «En el período»…»); descarga anónima con dos clics en la misma visita (cuenta una vez: 1 y 1); rango 2020-01-01 a 2020-01-31: «En el período» vuelve a 0 y «Total histórico» queda en 1 — pasó
- `npm test` (Vitest): 112 archivos, 1924 tests pasaron. `npm run typecheck` limpio. `npm run lint`: solo avisos que ya existían (DescargaModal, AuthContext, TallerFormPage), ninguno nuevo.

## Bugs
Ninguno.

## Observaciones
- No probé el aviso en móvil ni el desplazamiento horizontal de la tabla con 4 columnas (el spec de 360 px del tablero pasó, pero sin normativas con títulos largos).
- No probé las descargas de normativa sobre el borde de medianoche (día en hora de Argentina): lo cubre pgTAP.
- La base queda limpia con el `db:reset` final.

## Evidencia
Ver «Veredicto» de la corrida completa en el informe de la respuesta.
