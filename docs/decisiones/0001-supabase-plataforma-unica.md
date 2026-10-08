# 0001 · Supabase como plataforma única

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
El DAM necesita base de datos, login para un único administrador y almacenamiento de archivos.

## Decisión
Usar Supabase para las tres cosas (Postgres, Auth y Storage), sin diseñar una capa para cambiar de proveedor.
Los archivos van en un bucket de Supabase Storage. La cuenta de administrador se crea desde Supabase.

## Consecuencias
- Menos piezas que mantener para un equipo de dos personas.
- Acoplamiento al proveedor, aceptado conscientemente.
- La seguridad depende de políticas RLS bien escritas y testeadas.
