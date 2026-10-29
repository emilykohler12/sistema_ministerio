# Plan: helpers de fecha y RangoFechas compartidos (#39)

**Objetivo:** quitar la duplicación entre dashboard e historial, sin cambiar el comportamiento visible. Refactor puro.

**Archivos:**
- `src/shared/lib/date.ts` (+ test): exporta `ZONA_ARGENTINA`, `fechaReal(iso): Date | null` (la del historial: formato, día real, año >= 1), `fechaAIso(Date)` y `sumarDias(iso, n)`.
- `src/features/dashboard/periodo.ts`: usa los de `date.ts` en vez de `aFecha`, `aIso`, `sumarDias`, `esFechaReal` y `ZONA`.
- `src/features/historial/filtros.ts`: usa `fechaReal`, `fechaAIso` y `ZONA_ARGENTINA`; el +1 día pasa por `sumarDias`.
- `src/shared/components/ui/RangoFechas.tsx` (+ test): dos `<Input type="date">` con borrador local, espera de 300 ms, `aria-describedby` hacia el error y resincronización si las props cambian. Props: `desde`, `hasta` (strings, `''` = vacío), `error`, `idError`, `onCambio(desde, hasta)`.
- `SelectorPeriodo.tsx` y `FiltrosHistorial.tsx` lo usan. Dashboard solo aplica el rango si ambos campos tienen valor (como hoy); historial acepta vacíos como `null`.

**Pasos (test primero):**
1. Tests de `date.ts` (2026-02-30, año 0000, 29/02 bisiesto, +1 día en fin de mes y de año). Pasan con los helpers extraídos.
2. Test de `RangoFechas` (espera de 300 ms con fake timers, una sola llamada tras escribir, resincroniza al cambiar las props, error asociado). Se mudan de los tests de los dos componentes los que ya cubren lo mismo.
3. Reemplazar en periodo.ts, filtros.ts y los dos componentes. Los tests existentes de dashboard e historial no se tocan salvo para mover casos.

**Un cambio de comportamiento:** hoy el dashboard acepta `?desde=0000-01-01` como fecha real y `validarPeriodo` da el error "anterior al 01/01/2020". Con `fechaReal` del historial el año 0 es inválido y el período cae a "Últimos 30 días". Es inofensivo (Postgres rechaza el año 0). Lo acepto salvo que prefieras conservar el mensaje.

**Fuera de alcance:** cambios de UI, de RPC o de base; otros usos de fechas del repo.

**Verificación:** `npx vitest run src/shared src/features/dashboard src/features/historial src/pages/admin`, `npm run lint`, `npm run typecheck`. Toca dos pantallas pero no Storage, anon ni rutas: yo corro `npm run test:e2e` y después `npm run db:reset`.
