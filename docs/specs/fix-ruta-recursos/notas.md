# Notas: fix-ruta-recursos

## Pendiente (baja, fuera del corte)
- `codigosDeError` lee también el `code` de PostgREST/Postgres pero vive en `src/shared/lib/erroresStorage.ts`. Mover a
  `src/shared/lib/errores.ts` cuando se unifiquen las cuatro lecturas manuales de `.code` (descargas, normativas y dos en talleres).
  Crítica de código, punto 1.

## No verificado por Vitest
- Que `.eq('ruta_archivo', anterior)` con `.single()` devuelva `PGRST116` contra la base real es comportamiento documentado de PostgREST;
  `consultas.test.ts` fija la cadena de llamadas y `e2e/recursos.spec.ts` cubre baja y reemplazo en una pestaña.
