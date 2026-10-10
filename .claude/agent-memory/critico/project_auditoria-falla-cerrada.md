---
name: auditoria-falla-cerrada
description: auditar() de supabase-base tragaba errores por leer "nunca aborta" como regla general; se aceptó fallar cerrado (spec v3). Reglas por corte sin guardia = misma pérdida silenciosa desde afuera
metadata:
  type: project
---

En la Fase B de `supabase-base` (2026-10-10), el criterio 7 decía "la escritura nunca aborta". Lo había originado yo,
por el problema de las tablas puente sin `id`. El implementador lo leyó como "ningún error de auditoría aborta" y armó
bloques `exception` que tragaban errores. Recomendé fallar cerrado (§9.1) y **lo aceptaron**: el criterio 7 se reescribió
en la spec v3 y el test del `sub` inexistente espera `23503`. En la ronda 2 propuse guardias globales pgTAP (como
`rls_global.test.sql`) para el trigger `auditar()` en toda tabla de `public`, con una lista explícita de exclusiones, y
para la ausencia de TRUNCATE de `anon`/`authenticated`, vía `alter default privileges`.

**Why:** si un criterio mío se redacta como absoluto ("nunca", "nadie"), el código lo cumple al pie de la letra y suma
manejo de errores. Y una regla que "cada corte tiene que recordar" sin un test que la verifique se pierde en silencio,
igual que el error tragado.

**How to apply:**
- Cuando proponga un criterio, decir qué falla concreta no debe abortar, no "nunca aborta".
- En los cortes de dominio, revisar dos cosas: que los triggers nuevos no copien el patrón de tragar errores, y que
  existan los guardias globales (RLS, auditar, truncate). Si no los agregaron, buscar en `critica.md` de supabase-base
  la respuesta a la ronda 2.
- Las guardias (RLS, auditar, truncate) quedaron en ADR 0013. Cada transversal nueva que haya que repetir por tabla
  (por ejemplo `tocar_updated_at`, Fase B de auth-configuracion) pide su guardia `*_global.test.sql`, igual que esas.
- El perfil `lectura` del crítico no puede correr `npm run test:db`: decirlo y criticar leyendo el código.

Relacionado: [[permisos-agentes-vs-spec]].
