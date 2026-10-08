# 0002 · Arquitectura de agentes con Claude Code

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
Dos personas programan el DAM con agentes. Se necesita un flujo compartido, versionado en el repo.

## Decisión
Solo Claude Code. Un agente principal ("Ingeniero en Sistemas", output style) que discute, planifica
y orquesta, más cinco subagentes con rol único: Explore, test-writer, implementador, crítico y revisor.
Orquestación plana, TDD red/green para la lógica y verificación con hooks.
Detalle en `docs/agentes/diseno-arquitectura-agentes.md`.

## Consecuencias
- Se descartó gentle-ai para simplificar el mantenimiento.
- Las reglas obligatorias viven en hooks y permisos, no solo en instrucciones.
