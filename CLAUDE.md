# DAM — Ministerio de Educación de Misiones

Plataforma web donde las escuelas consultan y descargan recursos educativos (talleres y normativas)
sin pedirlos individualmente al Ministerio.

## Dominio
- Catálogo: nivel → categoría → taller → recursos (archivos o enlaces). También hay normativas.
- Las instituciones NO hacen login. Al descargar completan cargo, localidad e institución (`DescargaModal`).
- Único rol autenticado: administrador (un usuario por persona). Gestiona catálogo, normativas, padrón, configuración y ve el dashboard.
- Tipos del dominio: `src/features/*/types.ts`. Mapa completo: @docs/arquitectura.md
- Diseño funcional (requisitos y modelo de datos): `docs/definicion-dam.md`. Leelo antes de una feature o migración.

## Estado actual
- Los datos de dominio salen de mocks (`src/features/*/mocks/`) a través de hooks de React Query, salvo los dominios
  ya migrados. El login del admin ya usa Supabase Auth (`src/shared/lib/supabase.ts`, variables en `.env.local`).
- Supabase (Postgres, Auth, Storage, Edge Functions) se integra por cortes. Sin API propia
  (decisión 0004). Se migra un dominio por vez (0012): tipos derivados de la base, `consultas.ts` y hook delgado;
  la firma del hook se ajusta una vez al migrar su dominio y después queda estable.

## Stack
Vite · React 19 · TypeScript · Tailwind 4 · React Router 7 · React Query · react-hook-form + zod · Vitest · oxlint

## Entorno
- Todo corre dentro del Dev Container (`.devcontainer/`, decisión 0003): Node, dependencias, tests,
  hooks y Claude Code. No se instala nada en el host.
- Si no existe `node_modules`, estás fuera del contenedor: avisá en lugar de instalar.

## Comandos (dentro del Dev Container)
- Dev: `npm run dev`
- Tests: `npx vitest run <archivo>` (uno) · `npm test` (todos)
- Checks: `npm run lint` · `npm run typecheck`
- Build: `npm run build`

## Estructura
- `src/features/<dominio>/` types, hooks, mocks, componentes del dominio
- `src/pages/public/` y `src/pages/admin/` pantallas · `src/shared/` UI y utilidades reutilizables
- Alias `@/` → `src/`
- Tests junto al código: `archivo.test.ts` · utilidades de test en `src/test/`
- `docs/specs/<feature>/` una carpeta por feature o tarea · `docs/decisiones/` decisiones tomadas
- Mapa de la documentación: `docs/README.md`

## Reglas
- IMPORTANT: Antes de proponer un diseño, leé el índice `docs/decisiones/README.md` y abrí solo los ADR relevantes.
  No reabras decisiones sin un argumento nuevo.
- Reutilizá componentes de `src/shared/components/ui/` antes de crear uno nuevo.
- Validá formularios con zod + react-hook-form, como en los existentes.
- Nunca conectes agentes a la base de producción.
- Editá archivos con Edit/Write, no con comandos de shell: los hooks de protección y formato solo ven esas herramientas.
- Ramas: `feat/<feature>`, `fix/<bug>`, `chore/<tema>`. Commits: Conventional Commits en español.
- Al compactar, preservá: lista de archivos modificados, spec activa y comandos de test.

## Flujo de trabajo
Carriles consulta / directo / chico / feature (definidos en el output style). Arquitectura de agentes: `docs/agentes/`.
Autorizamos al agente principal a delegar en los subagentes del proyecto (`.claude/agents/`) según el carril,
sin pedir permiso cada vez: el flujo de carriles es nuestro pedido explícito de usarlos.
