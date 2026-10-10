---
name: tipos-v1-vs-firma-hooks
description: La regla "reemplazar el cuerpo de los hooks sin cambiar su firma" quedó superada por ADR 0012 (tipos derivados, cortes verticales); no repetir la discusión
metadata:
  type: project
---

Resuelto: el equipo aceptó la crítica de `estructura-carpetas` y la registró en ADR 0012 (2026-10-08).
Tipos del dominio derivados de `database.ts` en snake_case, `consultas.ts` por dominio, no se mockea
supabase-js (funciones puras + `vi.mock('../consultas')`), migración en cortes verticales por dominio.

**Why:** la premisa "la firma del hook no cambia" era falsa porque los tipos de `src/features/*/types.ts`
son v1 (ids string, nivel 'todos', `Taller.descargas`).

**How to apply:** si una propuesta vuelve a decir "la firma no cambia" o propone mappers camelCase por
entidad, remitir a 0012 en lugar de rehacer el argumento. Relacionado: [[permisos-agentes-vs-spec]].
