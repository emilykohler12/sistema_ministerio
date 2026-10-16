# Notas: corte dashboard

Interpretaciones, desvíos y pendientes de baja severidad que no entraron en el corte.

## Desvíos e interpretaciones
- **Retraso de 300 ms en el rango** (criterio 1). Los campos Desde y Hasta guardan el valor en estado local y lo pasan a la URL
  con `replace` 300 ms después de la última edición. Así no se consulta ni se marca error con un año a medio tipear.
- **Estado vacío** (criterio 8). Sin descargas en el período, la serie, el ranking, nivel y cargo muestran `EmptyState`.
  Localidades sigue mostrando su tabla, porque el padrón y la cobertura en 0 también informan. Normativas no depende del período.
- **`service_role`** conserva EXECUTE sobre `metricas_*` por los privilegios por defecto. No importa: saltea la RLS
  igual y recibe 42501 porque no es admin. El criterio 9 habla solo de los roles de la API pública (`public`, `anon`, `authenticated`).
- **Doble lectura del período.** Cada RPC plpgsql arranca con `perform 1 from metricas_registros(...)` para que el 42501 y el 22023 salten
  aunque el join o el `generate_series` queden vacíos. Con este volumen cuesta milisegundos. Si C-11 obliga a otra migración de
  métricas, conviene extraer una `metricas_validar() returns void`.

## Pendientes (baja)
- **Dos relojes para "hoy".** Lo calculan `periodo.ts` y la base. Si el equipo del admin tiene el reloj adelantado, cerca de la
  medianoche manda `hasta` = mañana y recibe 22023 hasta que el servidor cambie de día. Opciones: tolerar `hasta = hoy + 1` en la
  auxiliar, o tomar "hoy" de la base.
- **`BadgeEstadoTaller`** en `features/talleres/components/`, para no copiar `VARIANTE_ESTADO` en el ranking (crítica del código, punto 3).
  Toca el dominio `talleres`.
- **Guardia transversal `funciones_global`.** Verificaría que toda función de `public` tenga `search_path=''` y no dé EXECUTE a `public`
  (crítica de la spec, punto 7).
- **Hook de protección del test-writer.** Dejó escribir `metricas.test.sql` aunque su regla dice solo `*.test.ts(x)`. Hay que revisar si la regla
  o el hook están desalineados.
