# Notas (hallazgos bajos y decisiones diferidas de #29)

Salen de `critica.md` (crítica del código) y `revision.md`. No bloquean el PR.

- **Un solo contrato `onCambio({ progreso, fase })` en `subirReanudable`** (crítico, punto 2). Dejaría la deduplicación y la guardia contra eventos tardíos en el único módulo que conoce TUS y quitaría ~30 líneas de los dos hooks. Se rechazó en este corte porque la spec aprobada y los tests fijan `onProgress` y `onReintento` por separado; si más adelante se toca esta zona, conviene hacerlo junto.
- **`TERMINADOS` / `EN_CURSO` duplicados** entre `useRecursos.ts:138` y `RecursosPage.tsx:79-80`, y el cast `e.estado as EstadoEnCurso` en `RecursosPage.tsx:271` (crítico, punto 4). Exportar un guard `estaEnCurso(estado): estado is EstadoEnCurso` desde el hook.
- **Variables de entorno releídas** en `subidaReanudable.ts` (`import.meta.env.VITE_SUPABASE_*` con `?? ''`, que mandaría un `apikey` vacío sin avisar) en lugar de reutilizar la validación `leerVariable` de `supabase.ts` (crítico, punto 5). Exportar la URL y la clave ya validadas desde `supabase.ts`.
- **Anuncio residual (implementador, tras la ronda de correcciones):** si después de un lote se hace un reemplazo, mientras el reemplazo sube el `role="status"` todavía incluye el «subido» viejo del lote. El hito se limpia al empezar un lote, no al empezar un reemplazo. Menor; no pierde ningún anuncio.
- **El HEAD de un upload TUS responde 200 sin credenciales** si se conoce la URL del upload (`poc.md`). Fuera de alcance; anotarlo si se endurece Storage.
- **Retención de uploads incompletos** en la nube sin verificar, y abortar con el POST de creación en vuelo no manda el `DELETE` (queda un upload incompleto): aceptado por la spec.
- **Prueba manual pendiente** (paso 7 de la spec): ~13 MiB contra el proyecto de demos en la nube (S3 exige trozos de 6 MiB; el local no lo cubre).
