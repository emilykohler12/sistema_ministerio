# Plan: agente QA con Playwright (carril chico)

**Objetivo:** que alguien sea responsable de verificar en el navegador real que cada feature funciona de punta a punta contra el
Supabase local. Hoy ese paso queda sin hacer en todos los cortes. Va un sexto subagente, `qa`, con una pregunta propia:
**¿funciona en la app real?**

**Archivos:**
- Infraestructura de Playwright:
  - `package.json`: `@playwright/test` como devDependency y el script `test:e2e`;
  - `playwright.config.ts`: Chromium headless, `webServer` que levanta `npm run dev`, `baseURL` en `localhost:5173`, capturas al fallar;
  - `e2e/`: los tests y sus helpers (login con `admin@dam.local`);
  - Vitest no tiene que tomar `e2e/`.
- `.devcontainer/devcontainer.json`: `postCreateCommand` suma `npx playwright install --with-deps chromium`.
- `.gitignore`: `test-results/` y `playwright-report/`.
- El agente y sus permisos:
  - `.claude/agents/qa.md`: rol, salida en `docs/specs/<feature>/qa.md`, modelo sonnet y memoria de proyecto;
  - `.claude/hooks/limitar-escritura.mjs`: perfil `qa`, que solo puede escribir en `e2e/**`, `docs/specs/*/qa.md` y su memoria;
  - `.claude/hooks/limitar-bash.mjs`: el perfil que corresponda, para poder correr `test:e2e` y `db:reset` (`dev` no: lo levanta `webServer`).
- Flujo y documentación:
  - output style y `docs/agentes/`: en la feature, el paso 7 suma `qa`; en el carril chico, solo si toca una pantalla;
  - ADR 0020, que complementa a 0002 (6 subagentes): pruebas en el navegador escritas después de implementar, por un rol propio.

**Pasos:**
1. Infraestructura e instalación en el contenedor actual.
2. Agente y hooks, con un test del perfil nuevo en `src/test/hooks/`.
3. Flujo y documentación.
4. Estreno con el padrón.
5. Pasada de QA por los cortes anteriores.

**Verificación:**
- `npm run test:e2e` pasa con el padrón.
- El hook bloquea a `qa` si intenta escribir en `src/`.
- `npm test`, `lint` y `typecheck` pasan.

**Fuera de alcance:** CI. Las pruebas en el navegador corren en el contenedor.
