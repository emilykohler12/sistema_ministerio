---
name: auditoria-falla-cerrada
description: auditar() de supabase-base tragaba errores (when others) por leer "la escritura nunca aborta" como regla general; recomendé fallar cerrado según §9.1
metadata:
  type: project
---

En la Fase B de `supabase-base` (2026-10-10), el criterio 7 decía "la escritura nunca aborta". Lo había originado yo,
por el problema de las tablas puente sin `id`. El implementador lo leyó como "ningún error de auditoría aborta" y armó
dos bloques `exception`: un fallback de FK que graba `usuario_id = NULL` (o sea "sistema", justo lo que la FK sin
`set null` quería evitar) y un `when others` que solo deja un `raise warning`. Recomendé sacar los dos y fallar cerrado.
El argumento es §9.1 de la definición: la auditoría se cumple siempre. También sugerí `table_privs_are`, que compara el
conjunto exacto de privilegios, en lugar de `has_table_privilege` más `throws_ok` duplicados.

**Why:** si un criterio mío se redacta como absoluto ("nunca", "nadie"), el código lo cumple al pie de la letra y suma
manejo de errores que no hace falta.

**How to apply:**
- Cuando proponga un criterio, decir qué falla concreta no debe abortar, no "nunca aborta".
- En los cortes de dominio, revisar si los triggers nuevos copian el patrón de tragar errores.
- Ver la Respuesta de Fase B en `docs/specs/supabase-base/critica.md` para saber si lo aceptaron.

Relacionado: [[permisos-agentes-vs-spec]].
