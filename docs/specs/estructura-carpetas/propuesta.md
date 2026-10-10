# Propuesta: estructura de carpetas para integrar Supabase

Estado: borrador para crítica. Se incorporará a la spec `supabase-base` (infraestructura).

## Contexto
- Decisiones relevantes: 0001, 0004 (sin API propia, RLS + Edge Functions), 0011 (Supabase local con DinD).
- Definición v2 §9.2: "un único paquete Vite más la carpeta `supabase/`".
- El frontend ya está organizado por dominio en `src/features/<dominio>/{types, hooks, mocks, components}`.
- CLAUDE.md hoy dice: "al integrar Supabase, reemplazar el cuerpo de los hooks sin cambiar su firma".
- Los tipos del dominio (ids string, camelCase, arrays de etiquetas) no coinciden con las filas de la base
  (ids int, snake_case, tablas puente), así que hace falta un mapeo fila → dominio.

## Estructura propuesta

```
supabase/                         generado por `supabase init`
├── config.toml                   auth sin registro público, buckets
├── migrations/                   SQL versionado; una migración por tema (catalogo, auditoria, padron)
│                                 tabla + RLS + índices en la misma migración
├── tests/                        pgTAP, `supabase test db`; un archivo por tabla/tema
├── functions/
│   ├── _shared/                  CORS, cliente admin, validación
│   └── descargar-taller/index.ts
└── seed.sql                      niveles, destinatarios, datos de demo locales

src/
├── shared/lib/supabase.ts        cliente único (createClient con clave anon)
├── shared/types/database.ts      generado por `supabase gen types`; no se edita
└── features/<dominio>/
    ├── types.ts                  tipos del dominio (lo que consumen las pantallas)
    ├── api.ts                    NUEVO: consultas supabase-js + mapeo fila → dominio
    ├── api.test.ts
    ├── hooks/                    hooks delgados: React Query → api.ts
    ├── mocks/                    se convierten en fixtures de test o se borran al migrar el dominio
    └── components/
```

## Decisión principal: dónde viven las consultas

- **A. Consultas dentro del hook** (lo que dice CLAUDE.md hoy): menos archivos; testear el mapeo exige montar React Query; el hook mezcla dos responsabilidades.
- **B. `api.ts` por dominio + hook delgado** (recomendada): el mapeo se testea como función pura; el hook queda en pocas líneas; la firma pública no cambia. No es una API propia: corre en el navegador y llama directo a Supabase.

## Convenciones adicionales
- `database.ts` solo lo importan los `api.ts`, nunca páginas ni componentes.
- Dos suites de test: `npm test` (frontend) y `npx supabase test db` (base).

## Preguntas abiertas para la crítica
- ¿Hace falta `api.ts` o alcanza con mapear dentro del hook?
- ¿Dónde conviene ubicar los tipos generados?
- ¿Qué hacer con los mocks al migrar cada dominio?
- ¿Falta algo en `supabase/` (p. ej. dónde viven policies de Storage, helpers SQL como `es_admin()`)?
