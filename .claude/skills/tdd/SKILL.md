---
name: tdd
description: Reglas de red/green TDD del proyecto DAM. Usar al escribir lógica de negocio, hooks de datos, componentes, validaciones de formularios o políticas RLS.
---

## Reglas (aplican durante toda la tarea)
- Nunca código de producción sin un test que falle primero.
- Confirmá que el test falla por la razón correcta antes de implementar.
- Implementá lo mínimo para que pase; refactorizá con los tests en verde.
- No cambies un test para que pase. Si el test está mal, avisá.

## Comandos (dentro del Dev Container)
- Un archivo: `npx vitest run src/features/talleres/types.test.ts`
- Todos: `npm test`
- Modo watch: `npm run test:watch`

Si `npm test` dice que no encuentra vitest, estás fuera del Dev Container: avisá, no instales nada.

## Entorno
Vitest con `jsdom` y Testing Library (`vite.config.ts` → `test`). `src/test/setup.ts` carga los
matchers de jest-dom (`toBeInTheDocument`, `toHaveTextContent`...) y limpia el DOM entre tests.

## Convenciones
- El test vive junto al código: `useTalleres.ts` → `useTalleres.test.ts`.
- `describe` por función o componente, `it` en español describiendo el comportamiento.
- Preferí probar funciones puras. Si la lógica es compleja dentro de un hook o componente,
  extraela a una función exportada y probala ahí.

## Patrones (copiá de estos ejemplos)
- **Función pura:** `src/features/talleres/types.test.ts`.
- **Componente:** `render` + `screen` de `@testing-library/react`, consultas por rol o texto
  (`getByRole('alert')`), no por clases CSS. Ejemplo: `src/shared/components/ui/FieldError.test.tsx`.
  Si usa React Query o `Link`: `renderConProviders(ui, { ruta })` de `@/test/utils`.
- **Interacción:** `const user = userEvent.setup()` de `@testing-library/user-event`, luego `await user.click(...)`.
- **Hook con React Query:** `renderHook(() => useX(), { wrapper: crearWrapperQuery() })` y
  `await waitFor(() => expect(result.current.isSuccess).toBe(true))`.
  Para controlar los datos, mockeá el módulo de mocks con `vi.mock` + `vi.hoisted`.
  Ejemplo: `src/features/talleres/hooks/useTalleres.test.ts`.

## Qué se testea con TDD
Filtros y búsqueda del catálogo, esquemas zod, cálculo de métricas del dashboard, hooks de datos,
comportamiento de componentes (qué se muestra, qué pasa al interactuar, accesibilidad por rol),
helpers de `types.ts` y `shared/lib`, y políticas RLS cuando se integre Supabase.

## Qué no
Estilos y layout: se verifican levantando la app (`/run` o `/verify`) y revisando la pantalla.
