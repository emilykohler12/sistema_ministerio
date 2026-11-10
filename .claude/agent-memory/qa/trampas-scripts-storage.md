---
name: trampas-scripts-storage
description: Cómo probar scripts de mantenimiento (npm run storage:limpiar) siendo el perfil qa, que no puede correr node ni npm run arbitrarios
metadata:
  type: project
---
- El perfil qa solo puede correr `npm run test:e2e`/`npx playwright test`, `db:reset`, lint, etc. No `node x.ts`, `npm run storage:limpiar`, `rm`, ni `npx supabase`. Solución: un spec en `e2e/` que siembra con supabase-js (`supabaseLocal()` de `scripts/lib`) y lanza el script con `execFile('npm', ['run', ..., '--', ...args])`; imprimir la salida con console.log para el reporte.
- `rm` no existe para qa: un archivo temporal de e2e no se puede borrar (vaciarlo y avisar al coordinador). Mejor no crear temporales.
- storage.objects.created_at no se edita: para un objeto "viejo" sembrarlo, esperar >65 s con `expect.poll` sobre `created_at` (list con `search`) y usar `--edad-minima=1`.
- Falla cerrada sin tocar la nube: `SUPABASE_URL=http://qa-inexistente.invalid` + `--confirmar=qa-inexistente.invalid` (variables pasadas en el env del execFile, el hook no las ve). `localhost.` no resuelve: no sirve para probar clave inválida.
- Rutas de recurso deben empezar con `<taller_id>/`; `recurso` sin archivo: ruta que no existe en el bucket.
