# Métricas de los agentes

Para decidir con datos qué agente aporta (principio 1 del diseño: complejidad solo si mejora resultados de forma demostrable).
El ingeniero agrega una fila por feature al cerrarla (paso 9 del carril feature).

## Cómo se cuenta

- **Puntos / hallazgos:** los numerados en `critica.md`, `revision.md` y la sección "Bugs" de `qa.md`.
- **Rechazados:** en `## Respuesta`, los rechazados del todo o en parte.
- **Bugs evitados:** hallazgos que habrían llegado a `main` como un defecto real (falla, pérdida de datos, hueco de seguridad,
  defecto visible). No cuentan estilo, docs ni tests faltantes.
- **Únicos:** bugs evitados que ningún otro agente reportó.
- **Repetidos:** hallazgos que ya aparecían en la memoria del agente (candidatos a regla, ver el punto "Memoria" del diseño).

## Línea base (retroactiva, 2026-10-16)

Contada a mano desde los reportes de las 8 features cerradas. Los números son aproximados: los reportes no tenían un formato fijo.

| Feature | Crítica spec | Crítica código | Revisor | qa (bugs) |
|---|---|---|---|---|
| supabase-base | 3 | 7 | 15 | — |
| auth-configuracion | 10 | 6 | 9 | 0 |
| niveles-categorias | 8 | 3 | 4 | 0 |
| talleres | 9 | 6 | 6 | 0 |
| recursos | 3 | 5 | 7 | 0 |
| normativas | 8 | 6 | 11 | 0 |
| padron | 6 | 6 | 13 | 0 |
| descargas | 8 | 3 | 6 | 0 |
| **Total** | **55** | **42** | **71** | **0** |

Lo que muestran:

- **Crítica de spec: el paso más rentable.** Unos 11 bugs evitados antes de escribir código (p. ej. el orden BEFORE-trigger → RLS en
  recursos, `resolver_etiquetas` sin grant en normativas, "OTRA" con `establecimiento_id` en descargas, la caché por rol en niveles).
  Rechazos: 3 parciales en 97 puntos de crítica en total.
- **Crítica de código: aporta, y no solo diseño.** Cerca de la mitad de sus puntos son de corrección o de tests. Solapamiento
  explícito con el revisor: 5 de 42 (~12%).
- **Revisor: el mayor volumen, con mucha repetición.** ~15 de 71 hallazgos (~21%) son repetidos de su memoria: la verificación en el
  navegador sin anotar (9, en la práctica cubierta por el qa desde 0020) y ramas `isError` sin test (6). Es lo que ataca pasar las
  trampas a `.claude/rules/`.
- **qa:** 0 bugs formales en 9 corridas; 3 defectos reales clasificados como observaciones y verificación de integración que nadie más
  hace. Ya decidido en 0023.
- **test-writer y Explore:** no dejan un artefacto contable. No se puede evaluar su aporte con estos datos.

## Registro por feature (desde ahora)

| Feature | Fecha | Agente | Puntos (alta/media/baja) | Rechazados | Bugs evitados | Únicos | Repetidos |
|---|---|---|---|---|---|---|---|
| dashboard | 2026-10-16 | critico (spec) | 13 (2/7/4) | 1 (en parte: guardia global a notas) | 4 (cobertura sin OTRA vinculada, "hoy" en UTC, mes truncado en UTC, sin vincular sin localidad) | 4 | — |
| dashboard | 2026-10-16 | critico (código) | 4 (0/0/4) | 1 (BadgeEstadoTaller a notas) | 0 | 0 | — |
| dashboard | 2026-10-16 | revisor | 6 (0/0/6) | 3 (service_role: se corrigió la spec; dos relojes y estado vacío a notas) | 0 | 0 | 1 (service_role con EXECUTE) |
| dashboard | 2026-10-16 | qa | 1 (0/0/1) | 0 | 1 (scroll horizontal en celular por grid sin columnas y main sin min-w-0) | 1 | — |
| instituciones-sin-vincular | 2026-10-18 | critico (spec) | 12 (1/4/7) | 0 | 4 (foco del Dialog en cada render, grant que saltea DA005, variantes NULL, crear sin salida ante duplicado inactivo) | 4 | — |
| instituciones-sin-vincular | 2026-10-18 | critico (código) | 7 (0/2/5) | 0 | 2 (diálogo cerrable mientras guarda, elección oculta por la búsqueda) | 2 | 1 (role="status" montado con el texto, también del revisor) |
| instituciones-sin-vincular | 2026-10-18 | revisor | 7 (0/2/5) | 2 (test de skeleton y de foco de la página a notas) | 1 (orden sin test que lo distinga) | 1 | 2 (role="status", service_role con EXECUTE) |
| instituciones-sin-vincular | 2026-10-18 | qa | 0 | 0 | 0 | 0 | — |
| historial-operaciones | 2026-10-18 | critico (spec) | 12 (0/6/6) | 1 (mudar helpers del dashboard: en parte, a #39) | 5 (diff vacío al guardar sin cambios, PGRST103 en "Reintentar" en bucle, URL sin sanear, 42804 por `email` varchar, revoke de service_role) | 4 | — |
| historial-operaciones | 2026-10-18 | critico (código) | 6 (0/2/4) | 0 | 2 (consulta e historial del navegador por cada tecla de la fecha, foco perdido al paginar) | 2 | — |
| historial-operaciones | 2026-10-18 | revisor | 5 (0/0/5) | 0 | 1 (año 0000 en "Reintentar" en bucle) | 1 | 2 (orden que coincide con el de los uuid, retorno sin `pg_get_function_result`) |
| historial-operaciones | 2026-10-18 | qa | 1 (0/0/1) | 1 (416 en consola con `?pagina=999`: lo maneja la app, documentado en notas) | 0 | 0 | — |
| signout-sin-red | 2026-10-24 | revisor | 2 (0/1/1) | 0 | 1 (recarga sin red con el token vigente: regresión del carril sin red más común) | 1 | — |
| signout-sin-red | 2026-10-24 | qa | 2 (0/0/2) | 0 | 0 (demora de ~26 s y página de error con token vencido: a #48) | 0 | 1 (demora de los reintentos de refresh, ya anticipada por el revisor) |
| recuperacion-password | 2026-10-29 | critico (spec) | 16 (3/7/6) | 0 | 4 (flujo implicit que abre una sesión de admin antes de fijar la contraseña, 429 que revela qué cuentas existen, cierre del listener en carrera con `updateUser`, máximo de 72 en bytes) | 4 | — |
| recuperacion-password | 2026-10-29 | critico (código) | 6 (0/3/3) | 2 (`PantallaAuth` y `MotivoLogin`, a `notas.md`) | 2 (enlace «ingresá con ella» que entraba al panel, mensajes «venció» y «revisá tu conexión» falsos) | 1 (mensajes que afirman una causa desconocida) | — |
| recuperacion-password | 2026-10-29 | revisor | 3 (0/3/0) | 0 | 3 (enumeración de cuentas por un 5xx, enlace al login que entraba al panel, aviso del login sin foco) | 2 (enumeración por 5xx, aviso sin foco) | 1 (`role="status"` montado con su texto: tercera vez, pasó a `rules/react.md`) |
| recuperacion-password | 2026-10-29 | qa | 0 | 0 | 0 | 0 | — |
