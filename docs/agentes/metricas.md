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
