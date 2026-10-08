# Crítica: estructura de carpetas para integrar Supabase

Crítica de `propuesta.md`. Leí los ADR 0001, 0004, 0005 y 0011, la definición §8.4 y §9, y el código de
`src/features/*` y `src/shared/lib`. No reabro decisiones: todo lo que sigue cabe dentro de 0001, 0004 y 0011.

## Hallazgos

### 1. La premisa "la firma no cambia" es falsa, y el mapeo fila → dominio es una decisión, no algo inevitable

- **Problema:** la propuesta asume que los tipos del dominio se quedan como están y que `api.ts` los
  traduce. Pero esos tipos son v1: ids `string`, `nivel: 'todos'`, `Taller.nivel` duplicado,
  `Taller.descargas`, `RecursoArchivo` sin id, ruta, tamaño ni `ENLACE` (0008, 0009). Hay 19 usos de
  `categoriaId`, `.descargas` o `'todos'` en `src/pages/`, y `useEtiquetasSugeridas` es síncrono
  (devuelve un array, no un `useQuery`). O sea que las firmas y los tipos **van a cambiar sí o sí**. Si
  igual los mantienen en camelCase y escritos a mano, cada entidad suma un mapper y su test para siempre.
  Además, un cambio de columna deja de ser un error de compilación y pasa a ser un mapper que quedó viejo
  sin que nadie se entere.
- **Alternativa:** que `types.ts` **derive** de los tipos generados y use snake_case, igual que la base:
  `export type Normativa = Tables<'normativa'>`, y para los agregados un tipo extendido
  (`Taller = Tables<'taller'> & { recursos: Recurso[]; etiquetas: string[] }`). El mapeo queda solo
  donde hay forma real que traducir: tablas puente → arrays y recursos anidados. Las pantallas se
  adaptan una sola vez por dominio, en el mismo PR que migra ese dominio, cosa que ya iba a pasar por v2.
- **Severidad:** alta. Define cuánto código de traducción tendrá que mantener después el Ministerio.
- **Recomendación:** escribir en la spec `supabase-base` que la migración se hace **en cortes verticales
  por dominio** (migración + tipos + hook + pantallas). También, que la regla de CLAUDE.md pase a decir:
  "la firma de los hooks se ajusta una vez a los tipos v2 al migrar cada dominio; después queda estable".
  Si prefieren camelCase, que quede como decisión explícita, sabiendo que trae un mapper por entidad.

### 2. A vs. B es una falsa dicotomía: lo que conviene separar es la función pura, no la consulta

- **Problema:** los hooks actuales ya separan `fetchTalleres` de `useTalleres`, así que B es casi lo que
  ya existe. El riesgo de B está en `api.test.ts`: si testea "consultas supabase-js", hay que mockear la
  cadena `from().select().eq()…`. Esos tests son frágiles, se rompen al reordenar llamadas y no prueban
  nada que importe, porque la seguridad la prueba pgTAP y la forma, los tipos generados. A su vez, la
  definición §8.4 pide traer el catálogo publicado **una vez** y filtrar en el navegador ignorando
  tildes. Hoy `queryKey: ['talleres', filtro]` volvería a pedir todo cada vez que cambia el filtro.
- **Alternativa:** B liviana.
  - `api.ts` contiene funciones `async` planas: la consulta y, si hace falta, el mapeo de agregados. No se
    testea la consulta.
  - Lo testeable son funciones puras exportadas, como `filtrarTalleres(lista, filtro)` (tildes,
    descripción, etiquetas) y el mapeo de agregados del hallazgo 1.
  - El hook queda así: `useQuery({ queryKey: ['talleres', 'publicados'], queryFn: obtenerTalleresPublicados, select: (d) => filtrarTalleres(d, filtro) })`.
  - Los tests de hooks hacen `vi.mock('../api')`, el mismo patrón que hoy usa `useTalleres.test.ts` con
    los mocks.
  - Con un archivo de datos por dominio, siempre en el mismo lugar, quien mantenga sabe dónde buscar.
- **Severidad:** media.
- **Recomendación:** quedarse con B, pero escribir en la spec "no se mockea el cliente de Supabase; se
  testean funciones puras y los hooks con `vi.mock('../api')`". Conviene evaluar el nombre `consultas.ts`
  o `datos.ts`: `api.ts` choca con el titular de 0004 ("sin API propia") y la propuesta tiene que
  aclararlo justamente por eso.

### 3. En `supabase/` sobra una abstracción y faltan tres lugares definidos

- **Problema:**
  - `functions/_shared/` (CORS, cliente admin, validación) se crea para **una** sola función. Además,
    "validación" en `_shared` sugiere replicar el esquema zod de `DescargaModal`, y Deno no importa
    fácil desde `src/`.
  - No está definido dónde viven estas piezas: los buckets y las políticas de `storage.objects`; los
    helpers `es_admin()` y el trigger genérico de auditoría (0005), que todas las migraciones por tema
    necesitan antes; y el usuario admin local con `app_metadata.admin = true`, sin el cual no se puede
    probar el panel ni las políticas `authenticated`.
- **Alternativa:**
  - Todo el código de `descargar-taller` va en su `index.ts`. `_shared/` se crea cuando llegue
    `gestionar-usuarios` y haya algo realmente compartido.
  - Las reglas válidas son los CHECK y constraints de la base (§9.1). La función valida lo mínimo:
    taller publicado y forma del body. El zod del front es UX.
  - Primera migración `base`, con `es_admin()`, el trigger de auditoría y `unaccent`. Después, una
    migración por tema.
  - Los buckets y sus políticas van **en una migración SQL**, no en `config.toml`, para que la base local
    y la nube queden iguales con el mismo mecanismo.
  - `seed.sql` crea el admin local (insert en `auth.users` con `raw_app_meta_data`).
  - Scripts en `package.json`: `db:reset`, `db:types` y `test:db`, para que los comandos no vivan solo
    en la skill.
- **Severidad:** media. `_shared` es menor; los lugares faltantes sí bloquean la primera migración.
- **Recomendación:** sumar estos cuatro puntos a la estructura de `supabase-base` y completar con ellos
  la skill `supabase-rls`.

## Respuestas a las preguntas abiertas

- **¿Hace falta `api.ts`?** Sí, en su versión liviana (hallazgo 2). El argumento a favor no es "separar
  responsabilidades": es poder testear las funciones puras sin React Query y tener un lugar predecible.
- **¿Dónde van los tipos generados?** `src/shared/types/database.ts` está bien. Si se adopta el
  hallazgo 1, la convención "solo lo importan los `api.ts`" se invierte: lo importan los `types.ts`, y
  las páginas siguen usando solo `types.ts`.
- **¿Qué hacer con los mocks?** Borrarlos al migrar cada dominio. `seed.sql` pasa a ser la fuente de
  datos de demo y los fixtures de test se escriben dentro de cada test, como hoy en
  `useTalleres.test.ts`. No conviene un modo "mocks o Supabase" por variable de entorno: son dos caminos
  para mantener, y 0011 ya garantiza Supabase local en el contenedor.
- **¿Falta algo en `supabase/`?** Sí: los buckets y las políticas de Storage, la migración `base` con
  helpers y auditoría, y el admin del seed (hallazgo 3). Las variables `.env.example` y `.env.local`
  (URL y clave anon local) van junto a `src/shared/lib/supabase.ts`.

## Veredicto

**Opción B, en su versión liviana.** Lo que cambiaría:
1. Que los tipos del dominio deriven de `database.ts` en snake_case y que la migración sea por cortes
   verticales por dominio, corrigiendo la regla "sin cambiar la firma".
2. Que los tests apunten a funciones puras y que el filtrado del catálogo se haga en el cliente con
   `select`, sin mockear supabase-js.
3. Sacar `functions/_shared/` por ahora y fijar dónde van Storage, `es_admin()`, la auditoría y el
   admin local.

## Respuesta

1. **Acepto.** Tipos del dominio derivados de `database.ts`, en snake_case. Mapeo solo para los agregados.
   Migración en cortes verticales por dominio. Así un cambio de columna es un error de `tsc` y no un mapper
   desactualizado. Costo aceptado: las pantallas usan los nombres de la base, y `types.ts` es la única
   costura entre las dos. Esto reemplaza el "paso 0" propuesto en la conversación (alinear tipos con mocks):
   cada dominio se alinea en su propio corte. La regla de CLAUDE.md se corrige con un ADR (`/decision`).
   Requiere el visto bueno del equipo.
2. **Acepto.** B liviana. No se mockea supabase-js: se testean funciones puras y los hooks con
   `vi.mock`. El catálogo se trae una vez y se filtra con `select`. El archivo se llama `consultas.ts`.
3. **Acepto.** Sin `_shared/` hasta que exista una segunda función. Primera migración `base`, con
   `unaccent`, `es_admin()` y la auditoría. Buckets y políticas de Storage en una migración SQL. Admin
   local en `seed.sql`, solo para la base local. Scripts `db:reset`, `db:types` y `test:db`. Se suman a la
   spec `supabase-base` y a la skill `supabase-rls`.
