---
name: archivo-de-critica
description: El perfil critico de limitar-escritura.mjs solo deja escribir docs/specs/<feature>/critica.md; si el que llama pide otro nombre, agregar una sección ahí y avisarle
metadata:
  type: feedback
---

El perfil `critico` de `limitar-escritura.mjs` solo deja escribir `^docs/specs/[^/]+/critica\.md$` y la memoria. Si el
que llama pide otro archivo (por ejemplo `critica-codigo-fase-a.md`, 2026-10-08), no hay que intentarlo: agregar al
final de `critica.md` una sección `# Crítica del código (...)` y avisarle dónde quedó. Volvió a pasar el 2026-11-11
(`critica-codigo.md`, con «no toques critica.md»): agregué la sección al final, sin tocar lo anterior, y lo avisé.
El mismo perfil tampoco deja correr `npm run lint`/`typecheck`/`build`/`vitest`: lo dejo para el agente principal.

**Why:** el hook rechaza cualquier otra ruta, y la regla del crítico ya dice qué hacer cuando `critica.md` existe.

**How to apply:** en cada pedido que nombre otro archivo de salida. Relacionado: [[permisos-agentes-vs-spec]].
