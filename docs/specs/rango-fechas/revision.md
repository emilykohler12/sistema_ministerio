# Revisión 1

## Veredicto
Aprobado con cambios (un test faltante, sin errores de lógica).

## Problemas
- **[media]** `src/features/dashboard/components/SelectorPeriodo.tsx:26` — el plan pide "Dashboard solo aplica el rango si ambos
  campos tienen valor (como hoy)". La guarda `if (desde && hasta)` es ahora la única lógica propia del selector (antes estaba en la
  condición del efecto) y ningún test la cubre: `RangoFechas` sí emite `''` (test "vaciar un campo avisa con cadena vacía") y
  `DashboardPage.test.tsx` no vacía nunca un campo. Si alguien quita la guarda, `onRango('', hasta)` escribe `?periodo=rango&desde=&hasta=…`,
  `periodoDesdeUrl` lo rechaza, el tablero cae a "Últimos 30 días" y los campos desaparecen mientras el usuario edita; los tests siguen
  verdes. Propuesta: en `DashboardPage.test.tsx`, con `?periodo=rango&desde=2026-03-10&hasta=2026-03-12`, vaciar "Desde", avanzar 300 ms
  y comprobar que la URL conserva `desde=2026-03-10` y que los campos siguen visibles (el de "Desde" vacío).

## Desvíos reportados
1. **`diasEntre` en `date.ts`**: aceptable. `diasEntre(d, h) + 1` es exactamente el `diasDelPeriodo` anterior (`Math.round` sobre medianoches UTC),
   así que `porMes` no cambia. Tiene test (0, 91 días y negativo).
2. **`filtros.ts` sin `fechaAIso` ni `ZONA_ARGENTINA`**: aceptable y equivalente. `aTimestamp` recibe un string que ya pasó `fechaReal`
   (regex de 4 dígitos, año >= 1), que es el mismo texto que antes salía de rellenar el `Date`. `sumarDias(hasta, 1)` arma el `Date` con
   `setUTCFullYear` igual que antes: fin de mes, fin de año, 29/02 y hasta `9999-12-31` → `10000-01-01` dan el mismo resultado.
   `OFFSET_ARGENTINA` (`-03:00` fijo) es lo correcto para un literal de timestamp: la zona IANA no sirve ahí. `fechaAIso` queda exportada
   y solo la usan `sumarDias` y los tests, como lista el plan.
3. **Borrador del dashboard al cambiar de tipo**: no rompe "sin cambio visible". `elegirTipo` (`DashboardPage.tsx:114`) escribe
   `{ ...periodo, tipo }`: al pasar de "Rango" a "Últimos 30 días" o "Año en curso" cambian `periodo.desde`/`hasta`, y el código anterior ya
   reiniciaba el borrador por la comparación con `vistos`. Al volver a "Rango" la URL lleva las fechas del preajuste, que son las que
   recibe `RangoFechas` al montarse: mismo resultado que antes. El único caso distinto es un borrador a medias (un campo vacío, que no se
   aplica) cuando el rango aplicado coincide justo con el del preajuste: antes reaparecía el campo vacío, ahora reaparece el rango
   aplicado, que es lo que dice la URL. Un timer pendiente se cancelaba antes por `periodo.tipo` en las dependencias y ahora por el
   cleanup al desmontar. No conviene corregirlo.

## Puntos revisados sin hallazgos
- **Ref de `onCambio`** (`RangoFechas.tsx:34-37`): el efecto que actualiza la ref se declara antes que el del timer, así que en el mismo flush
  la ref ya tiene la función nueva; un `onCambio` nuevo no reinicia la espera y se llama el último (test "una nueva función onCambio no
  reinicia la espera"). El callback del timer usa el `borrador` de su propio cierre, que se renueva con cada edición. El cleanup del efecto
  limpia el timer al desmontar y en cada cambio.
- **Resincronización** (`RangoFechas.tsx:28-31`): al cambiar las props, el borrador pasa a las props durante el render, `hayCambio` queda en
  false y el cleanup cancela el timer pendiente: no hay `onCambio` espurio (test con edición en curso + `rerender` + 1000 ms). La resincronización
  solo corre si cambian `desde`/`hasta`: cambiar usuario o entidad en el historial no pisa una fecha a medio escribir. Volver al valor
  original antes de los 300 ms no avisa (test).
- **Fechas**: `fechaReal` es la del historial sin cambios. En el dashboard la única diferencia es el año 0000, aprobada por el usuario y con
  test en `periodo.test.ts`. Los navegadores no emiten el año 0000 en `type="date"` (la cadena válida exige año > 0), así que no afecta la edición.
- **A11y**: los dos campos conservan `Label`/`htmlFor` con `useId`, `aria-invalid` y `aria-describedby` hacia el `FieldError` solo cuando hay
  error (`rules/react.md`); el `FieldError` sigue en el padre, en el mismo lugar que antes.
- **Alcance**: sin cambios de UI, RPC, base ni otros usos de fechas. No se mudaron tests de las páginas: no hay tests de los dos componentes y los
  de página siguen cubriendo el flujo de punta a punta, lo que es compatible con el plan.

## Evidencia
- `npx vitest run src/shared src/features/dashboard src/features/historial src/pages/admin`: 40 archivos, 652 tests, todos pasan.
- `npm run lint`: exit 0. Cuatro warnings previos (`TallerFormPage`, `DescargaModal`, `ConfiguracionPage`, `AuthContext`), ninguno en archivos tocados.
- `npm run typecheck` (`tsc -b`): exit 0, sin errores.
- E2E no corridos (los corre el agente principal).
