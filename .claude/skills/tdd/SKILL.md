---
name: tdd
description: Reglas de red/green TDD del proyecto DAM. Usar al escribir lógica de negocio, hooks de datos, validaciones de formularios o políticas RLS.
---

## Reglas (aplican durante toda la tarea)
- Nunca código de producción sin un test que falle primero.
- Confirmá que el test falla por la razón correcta antes de implementar.
- Implementá lo mínimo para que pase; refactorizá con los tests en verde.
- No cambies un test para que pase. Si el test está mal, avisá.

## Comandos
- Un archivo: `npx vitest run src/features/talleres/types.test.ts`
- Todos: `npm test`
- Modo watch: `npm run test:watch`

## Convenciones
- El test vive junto al código: `useTalleres.ts` → `useTalleres.test.ts`.
- `describe` por función o componente, `it` en español describiendo el comportamiento.
- Preferí probar funciones puras. Si la lógica está dentro de un hook o componente,
  extraela a una función exportada y probala ahí.

## Qué se testea con TDD
Filtros y búsqueda del catálogo, esquemas zod, cálculo de métricas del dashboard,
helpers de `types.ts` y `shared/lib`, y políticas RLS cuando se integre Supabase.

## Qué no
Estilos y layout: se verifican levantando la app (`npm run dev`) y revisando la pantalla.
