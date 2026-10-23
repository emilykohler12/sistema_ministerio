# Plan: redes sociales en /contacto (#24)

**Objetivo:** `/contacto` muestra Facebook e Instagram de `configuracion`, solo los que tengan valor.

**Archivos:** `src/pages/public/ContactoPage.tsx` y `ContactoPage.test.tsx`. Sin base de datos, Storage ni rutas.

**Pasos (test primero):**
1. Tests en rojo: cada red aparece como enlace (`target="_blank"`, `rel="noreferrer"`) cuando tiene valor; no aparece si está vacía; con solo redes cargadas no se muestra "Todavía no hay datos de contacto".
2. `hayDatos` incluye `facebook` e `instagram`.
3. Dos `DatoDeContacto` (Facebook, Instagram) con el mismo patrón del footer. Ícono: el de marca de `lucide-react` si existe; si no, `Globe`.
4. Rama `feat/redes-contacto`; el PR lleva `Closes #24`.

**Fuera de alcance:** validar `https://` en el zod de `ConfiguracionPage` (el footer tiene el mismo problema; va como issue aparte), logo (#23).

**Verificación:** `npx vitest run src/pages/public/ContactoPage.test.tsx`, `npm run lint`, `npm run typecheck`, `npm run test:e2e` como regresión y después `npm run db:reset`.
