# 0013 · Auditoría que falla cerrada y guardias globales en la base

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
0005 pide auditar toda escritura con un trigger genérico (`auditar()`), y §9.1 exige que se cumpla venga de donde
venga el cambio. En supabase-base apareció un "nunca aborta" que tragaba cualquier error de auditoría, y la crítica
de código mostró que cada corte de dominio debía acordarse de tres cosas sin que nada lo verificara: RLS, el trigger
y quitar TRUNCATE (que no dispara triggers de fila ni pasa por RLS). Un olvido perdía auditoría en silencio.

## Opciones consideradas
- **Auditoría tolerante (traga errores, `raise warning`):** la escritura nunca falla, pero puede quedar sin registro
  y nadie se entera (el warning no llega por PostgREST).
- **Auditoría que falla cerrada:** sin registro no hay escritura. Más estricta; el único error esperable (`sub` sin
  fila en `auth.users`) no debería ocurrir porque los usuarios se banean, no se borran (0005).
- **Checklist por corte (skill) vs. guardias globales (tests pgTAP + privilegios por defecto):** el checklist depende
  de la memoria; las guardias fallan solas.

## Decisión
`auditar()` falla cerrada: sin bloques `exception`. Solo la forma de la tabla (sin `id`) no aborta.
Tres tests globales que heredan todos los cortes: `rls_global` (RLS activado), `auditoria_global` (trigger en toda
tabla de `public`, salvo excepciones listadas y justificadas) y `truncate_global`. La migración `guardias` quita
TRUNCATE a anon y authenticated por privilegios por defecto del rol `postgres`.

## Consecuencias
- Cada corte crea su trigger `auditar()`; si no lo hace, `npm run test:db` falla. Excluir una tabla exige justificarlo.
- No hace falta `revoke truncate` por tabla. Límite: las tablas creadas a mano como `supabase_admin` (Studio) no
  heredan el default, pero no viven en migraciones y la guardia sobre tablas existentes las detecta.
- Un error 23503 por la FK de `registro_operacion` no debe traducirse como "registro en uso" en el frontend.
