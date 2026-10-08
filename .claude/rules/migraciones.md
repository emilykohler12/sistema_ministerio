---
paths:
  - "supabase/**"
---

# Migraciones de Supabase

- Una migración por cambio, con nombre descriptivo. Nunca edites una migración ya commiteada: creá otra.
- Toda tabla nueva tiene RLS habilitado en la misma migración.
- Las instituciones (rol `anon`) solo leen contenido publicado e insertan registros de descarga.
- Solo el administrador autenticado escribe en el catálogo.
- Cada política RLS tiene un test (ver skill `supabase-rls`).
