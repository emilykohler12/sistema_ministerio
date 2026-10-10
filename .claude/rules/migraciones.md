---
paths:
  - "supabase/**"
---

# Migraciones de Supabase

- Una migración por cambio, con nombre descriptivo. Nunca edites una migración ya commiteada: creá otra.
- Toda tabla nueva tiene RLS habilitado en la misma migración.
- Las instituciones (rol `anon`) solo leen contenido publicado e insertan registros de descarga por la RPC `registrar_descarga` (0022), no con INSERT directo.
- Solo el administrador autenticado escribe en el catálogo.
- Cada política RLS tiene un test (ver skill `supabase-rls`).
