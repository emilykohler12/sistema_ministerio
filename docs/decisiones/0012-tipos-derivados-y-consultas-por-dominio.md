# 0012 · Tipos derivados de la base, `consultas.ts` por dominio y migración por cortes verticales

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
0004 decía que, al integrar Supabase, los hooks cambiaban "el cuerpo, no la firma". Pero los tipos del dominio son de la v1
(ids string, nivel `'todos'`, `Taller.descargas`, recursos sin id ni `ENLACE`) y las pantallas los usan,
así que la firma va a cambiar de todos modos. Detalle en `docs/specs/estructura-carpetas/`.

## Opciones consideradas
- **Tipos camelCase escritos a mano + mapper por entidad:** las pantallas no ven la base; hay un mapper y su test por tabla, y si la base cambia, el mapper queda desactualizado sin que nada avise.
- **Tipos derivados de `database.ts` (snake_case):** si cambia una columna, falla `tsc`; las pantallas usan los nombres de la base.
- **Consultas dentro del hook vs. archivo aparte:** dentro, el mapeo solo se testea montando React Query.

## Decisión
- `src/features/<dominio>/types.ts` deriva de `src/shared/types/database.ts` (generado): `Tables<'x'>`, más arrays para los agregados.
- `src/features/<dominio>/consultas.ts`: funciones async con supabase-js y funciones puras (filtrado, armado de agregados). Los hooks quedan delgados.
- No se mockea supabase-js: se testean las funciones puras, y los hooks con `vi.mock('../consultas')`. La seguridad se prueba con pgTAP.
- Se migra un dominio por vez (migración, tipos, consultas, hook y pantallas en un solo PR). Los mocks del dominio se borran al migrarlo; no hay modo "mocks o Supabase".

## Consecuencias
- Precisa 0004: la firma de cada hook se ajusta una vez, al migrar su dominio; después queda estable.
- Las páginas importan `types.ts`, nunca `database.ts`.
- El catálogo publicado se trae una vez y se filtra en el cliente con `select` (definición §8.4).
