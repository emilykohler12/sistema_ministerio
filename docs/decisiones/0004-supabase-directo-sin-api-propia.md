# 0004 · Supabase directo desde el frontend, sin API propia

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
La definición v1 (§9.1) agregaba una API Node + Express para proteger las descargas y no exponer la
clave de servicio. Eso suma un segundo deploy, Docker, monorepo `frontend/backend/shared` y un servidor
que alguien del Ministerio debe mantener después de la práctica (C-04, C-07).

## Opciones consideradas
- **API Express:** lógica centralizada en Node; dos deploys, suspensión en Render gratuito, RLS igual necesario.
- **Supabase directo + RLS + Edge Functions:** sitio estático + Supabase; lógica repartida entre SQL y funciones.
- **Híbrido (lecturas directas, escrituras por API):** suma los costos de las dos.

## Decisión
Supabase directo + RLS + Edge Functions. La clave `anon` es pública por diseño; la seguridad la da RLS.
La clave de servicio vive solo en las Edge Functions (`descargar-taller`, y más adelante `gestionar-usuarios`).
Las reglas de negocio van en la base (constraints, triggers, RPC). Coherente con 0001.

## Consecuencias
- Producción = sitio estático + Supabase. C-04 deja de bloquear.
- Los hooks de `src/features/*/hooks/` cambian su cuerpo, no su firma.
- Regla obligatoria: **RLS activado en todas las tablas**, con tests de políticas (skill `supabase-rls`).
- El informe académico describe una arquitectura BaaS / serverless en lugar de tres capas con API propia.
