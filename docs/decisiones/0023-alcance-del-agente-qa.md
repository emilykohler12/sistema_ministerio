# 0023 · El qa corre por riesgo de integración en el carril chico y reporta como bug todo defecto visible

- **Estado:** aceptada. Modifica a 0020 (cuándo corre el qa y cómo clasifica); el resto de 0020 sigue vigente
- **Fecha:** 2026-10

## Contexto
Tras ocho reportes (`docs/specs/*/qa.md`, diez corridas) el qa no anotó ningún bug en su sección "Bugs". Sí aportó por dos vías:
1. **Observaciones que eran defectos:** `/contacto` mostraba datos fijos de otra institución al público, el duplicado de normativa quedaba
   fuera de vista sin marcar el campo y el `Breadcrumb` repetía keys. Las tres se corrigieron en `fix/pendientes-app`, pero el qa las
   clasificó como observaciones y no como bugs, así que el coordinador podía pasarlas por alto.
2. **Verificación de integración que nadie más hace:** la firma de Storage como anon (publicado 200, borrador 400) y el nombre real de la
   descarga (`suggestedFilename`). Vitest usa mocks y pgTAP prueba la base aislada.

En cambios chicos de pantalla sin integración nueva corrió igual, en serie después del revisor y con `db:reset`, sin encontrar nada.
La suite e2e (27 tests, unos 2 minutos) ya sirve de regresión sin escribir specs nuevas.

## Opciones consideradas
- **Dejarlo igual.** Mantiene el valor, pero paga tiempo y tokens en cambios chicos sin riesgo de integración.
- **Eliminarlo** y que el coordinador corra `test:e2e`. Es lo más barato, pero la suite deja de crecer y nadie mira la pantalla.
- **Achicar cuándo corre y endurecer cómo clasifica.**

## Decisión
La tercera:
- **Feature:** sin cambios; corre si el cambio toca una pantalla.
- **Chico:** corre el qa solo si el cambio toca Storage, permisos de anon (RLS o una RPC que llame un visitante) o rutas. Si toca
  una pantalla sin nada de eso, el coordinador corre `npm run test:e2e` como regresión (después del revisor) y luego `npm run db:reset`.
- **Clasificación:** todo lo que está mal en lo que ve un usuario es un bug, como mínimo menor, aunque la spec no lo pida (datos fijos,
  mensajes fuera de vista, avisos de consola, estados vacíos sin mensaje). "Observaciones" queda para huecos de cobertura, sugerencias y dudas.

Queda afuera darle al qa lectura de la base local (hoy no puede contar filas). Implica abrir `psql` en el perfil `qa` de `roles.mjs`
y garantizar que solo apunte al local; se decide aparte si hace falta.

## Consecuencias
- Los carriles chicos sin integración nueva terminan antes y sin una corrida de Sonnet.
- Un cambio chico de pantalla no suma e2e propios: solo lo cubre la suite existente.
- Más bugs menores en los reportes; el coordinador los filtra como los del revisor (solo los que afectan corrección, seguridad, requisitos o simplicidad).
