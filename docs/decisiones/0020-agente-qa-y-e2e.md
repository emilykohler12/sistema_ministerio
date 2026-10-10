# 0020 · Agente qa y pruebas e2e con Playwright, escritas después de implementar

- **Estado:** aceptada. Complementa a 0002 (que pasa a tener seis subagentes), no la reemplaza
- **Fecha:** 2026-10

## Contexto
Cada corte se cierra con tests de Vitest y pgTAP, pero nadie verifica en el navegador que la pantalla funcione contra Supabase
local. El revisor lee código y el crítico cuestiona el diseño: la verificación de punta a punta quedaba sin dueño.

## Opciones consideradas
- **e2e escritos antes**, por el test-writer. Son frágiles: los selectores, textos y rutas todavía no existen.
- **Verificación manual** con `/verify`. No deja pruebas repetibles ni un registro.
- **Un subagente `qa`** que escribe e2e después de implementar, los corre y reporta.

## Decisión
Sexto subagente `qa` (Sonnet), con una pregunta propia: **¿funciona en la app real?** Corre después de crítico y revisor (que
siguen en paralelo) y, en el carril chico, solo si el cambio toca una pantalla.
- Playwright con Chromium headless; `npm run test:e2e`; specs en `e2e/<feature>.spec.ts`; contra Supabase local, nunca la nube.
- Pocas pruebas por feature: camino feliz y 2 o 3 errores clave de la spec. Lo demás ya lo cubren Vitest y pgTAP.
- No modifica la app: reporta en `docs/specs/<feature>/qa.md`. Un hook limita su escritura a `e2e/`, `qa.md`, sus capturas y su memoria.
- Su shell excluye banderas como `--config` o `--reporter`. Es defensa en profundidad y se puede evadir: la contención real es revisar el diff de `e2e/` (los spec son código Node).
- Corre solo, nunca en paralelo con el revisor (comparten la base), y al terminar hace `npm run db:reset` (pgTAP asume tablas vacías).

## Consecuencias
- El `postCreateCommand` instala Chromium: el build del contenedor es más lento y pesado.
- Sin CI: los e2e corren solo en el contenedor. Por perfil, `test-writer` y `revisor` no corren `test:e2e`; lo puede correr el coordinador.
