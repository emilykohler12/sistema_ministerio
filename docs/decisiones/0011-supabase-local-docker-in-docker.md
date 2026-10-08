# 0011 · Supabase local con Docker-in-Docker

- **Estado:** aceptada (se implementa al empezar la integración con Supabase)
- **Fecha:** 2026-10

## Contexto
0003 dejó abierto cómo levantar Supabase local (`supabase start`, ~10 contenedores) desde el Dev Container.
Las migraciones y los tests de RLS necesitan una base reproducible, aislada y descartable por persona.

## Opciones consideradas
- **Socket del Docker del host:** simple, pero equivale a root en el host; rompe el aislamiento de 0003.
- **Docker-in-Docker (feature de Dev Containers):** `supabase start` sin cambios; requiere `privileged` y ~2-3 GB.
- **Proyecto en la nube solo para desarrollo:** base compartida entre dos, no reseteable, pausa por inactividad.

## Decisión
Docker-in-Docker para desarrollo y tests (`supabase db reset` en una base descartable).
Un proyecto de Supabase en la nube, separado del de producción, para demos (etapa 1 de despliegue).

## Consecuencias
- Se mantiene "todo corre en el contenedor, nada en el host" (0003).
- Se acepta el modo `privileged`: riesgo menor y más acotado que exponer el socket del host.
- Primer arranque lento por la descarga de imágenes dentro del volumen.
