# 0003 · Desarrollo dentro de un Dev Container

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
Los tests, los checks y los agentes tienen que correr siempre en Docker, sin instalar nada en el host.
Los hooks de Claude Code corren `npm` donde corre Claude Code.

## Opciones consideradas
- **Dev Container:** VS Code, Claude Code, hooks y herramientas corren dentro del contenedor.
- **docker compose + exec:** Claude Code en Windows; cada hook y comando pasa por `docker compose exec`.

## Decisión
Dev Container (`.devcontainer/devcontainer.json`). "Todo corre en Docker" queda garantizado por el
entorno, no por instrucciones: hooks y comandos no saben que existe Docker. Además el editor tiene
`node_modules` (tipos en VS Code) y el agente queda aislado del resto de la máquina.

## Consecuencias
- Requiere Docker Desktop y la extensión Dev Containers. Sin el contenedor, los checks no corren (el hook avisa).
- `node_modules` y el login de Claude viven en volúmenes. En Windows, Vite y vitest usan polling.
- `.gitattributes` fuerza LF para que el git de Linux y el de Windows vean los mismos cambios.
- Supabase local también usa Docker: al integrarlo hay que decidir entre darle al contenedor acceso
  al Docker del host (pierde aislamiento) o levantar Supabase desde el host. Resuelto en 0011 (Docker-in-Docker).
