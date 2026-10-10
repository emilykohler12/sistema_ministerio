# niveles-categorias: segundo corte vertical

- **Estado:** implementada (v2, en `feat/niveles-categorias`)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-10

## Objetivo
Pasar los niveles educativos (0008) y las categorías del dominio `talleres` a Supabase (0012), con un CRUD real de categorías en el panel
(hoy es una maqueta que no persiste nada). Es la base del catálogo para el corte de talleres. Los talleres siguen en mock.

## Criterios de aceptación
1. La base tiene los 5 niveles de 0008, con ids 1-5 y un `orden`. Ningún rol de la API (tampoco el admin) los modifica.
   El frontend usa la constante `NIVELES`, con el tipo derivado de la base, y el pgTAP compara las filas exactas. En el código ya no existe `'todos'`.
2. `/admin/talleres` lista los 5 niveles con la cantidad de categorías activas de cada uno. Cada nivel lleva a `/admin/talleres/:nivelId`.
   Si `:nivelId` o `:categoriaId` no son números válidos o no existen, la pantalla muestra "no encontrado".
3. El admin crea y edita categorías (nombre obligatorio, sin espacios en los bordes y de hasta 150 caracteres; descripción opcional). Los cambios persisten y
   cada operación deja una fila en `registro_operacion` con el `usuario_id` del admin. Al editar no se puede cambiar el nivel.
   Si la categoría a editar no carga, se muestra un `role="alert"` con "Reintentar" en lugar del formulario.
4. Si el nombre repite el de otra categoría del mismo nivel, aunque difiera en mayúsculas, tildes o espacios, el formulario muestra
   "Ya existe una categoría con ese nombre en este nivel (puede estar dada de baja)" y no guarda. En otro nivel, el mismo nombre sí se permite.
   Cualquier otro error muestra un mensaje genérico.
5. Baja lógica: "Dar de baja" (con confirmación) pone `activo = false`. La categoría sigue en la lista del admin con la marca "Inactiva" y el botón "Reactivar".
   No hay borrado físico desde la API.
6. Portal: el filtro de nivel de `/talleres` ofrece los 5 niveles. anon y authenticated sin la marca solo leen las categorías activas.
7. pgTAP (`supabase/tests/niveles_categorias.test.sql`):
   - `nivel_educativo`: `results_eq` con las 5 filas exactas. anon puede hacer SELECT. INSERT da `42501` para anon y para el admin.
     UPDATE y DELETE del admin no tienen efecto.
   - `categoria`:
     - anon y authenticated sin marca ven solo las activas; su INSERT da `42501` y su UPDATE no tiene efecto.
     - El admin ve todas, inserta y actualiza. Su DELETE no tiene efecto. Su INSERT deja una fila en `registro_operacion` con su `sub`.
     - Duplicados normalizados en el mismo nivel dan `23505`, tanto por INSERT como por UPDATE, también con espacios en los bordes y también contra una
       categoría inactiva. En otro nivel, el mismo nombre pasa.
     - Un nombre en blanco da `23514` y un `nivel_id` inexistente da `23503`. `updated_at` se actualiza solo.
   - Las guardias globales siguen en verde.
8. Pasan `typecheck`, `lint`, `test`, `build` y `test:db`. Al cerrar no queda `categorias.mock.ts`, ni `Nivel`, `NIVELES_FILTRO`, `NIVEL_VALUES` o `nivelLabel`.
9. La caché de React Query se limpia cada vez que cambia el usuario derivado (de anon a admin y viceversa), no solo en `SIGNED_OUT`.
   Así, quien entra al panel después de visitar el portal ve las categorías inactivas.

## Diseño
**Base** (`supabase/migrations/<ts>_niveles_categorias.sql`)
- `nivel_educativo`:
  - Columnas: `id smallint primary key` (ids explícitos), `nombre varchar(50) unique not null`, `orden smallint not null`. Sin timestamps (catálogo fijo).
  - RLS: solo `select` para anon y authenticated. Lleva el trigger `nivel_educativo_auditar`.
- `categoria`:
  - Columnas: `id int generated always as identity`, `nivel_id smallint not null references nivel_educativo`, `nombre varchar(150) not null check (btrim(nombre) <> '')`,
    `descripcion text not null default ''`, `activo boolean not null default true`, `created_at` y `updated_at`.
  - Índice único `(nivel_id, lower(public.inmutable_unaccent(btrim(nombre))))`.
  - RLS:
    - select `to anon, authenticated using (activo or (select public.es_admin()))`;
    - insert y update `to authenticated` con `(select public.es_admin())`;
    - sin política de delete.
  - Triggers: `categoria_auditar` y `categoria_tocar_updated_at`.
- Después se corre `npm run db:types`.

**Dominio** (`src/features/talleres/`)
- `types.ts`:
  - tipos: `NivelEducativo`, `Categoria`, `CategoriaNueva` (`Pick` de `TablesInsert` con `nivel_id`, `nombre` y `descripcion`) y `CategoriaCambios` (`nombre`, `descripcion` y `activo`);
  - `NIVELES = [...] as const satisfies readonly NivelEducativo[]` y `nombreNivel(id)`.
- `errores.ts`: módulo puro con `esNombreDuplicado(error)` (`code === '23505'`).
- `consultas.ts`:
  - `obtenerCategorias()`: todas las visibles para el rol, ordenadas por nombre;
  - `crearCategoria(nueva)` y `actualizarCategoria(id, cambios)`: las dos terminan en `.select().single()`, así un update que la RLS bloquea sale como error.
- Hooks: `useCategorias(nivelId?)` y `useCategoria(id)` comparten la key `['categorias']` y filtran con `select`.
  `useCrearCategoria` y `useActualizarCategoria` invalidan `['categorias']`. La baja y la reactivación son `actualizar({ activo })`.
- `AuthContext`: guarda en un `useRef` el id del usuario anterior y hace `queryClient.clear()` cuando cambia (salvo en `INITIAL_SESSION`).
- `Taller` sigue en mock: `categoriaId: number`, sin `nivel`; `descargas` queda. Se quita el filtro por nivel de `useTalleres`.
  El catálogo filtra por `categoriaId ∈ categorías del nivel`. `TallerCard` y `TallerDetallePage` dejan de mostrar el nivel hasta el corte de talleres.

**Pantallas**
- Rutas: `:nivel` pasa a `:nivelId`. `:categoriaId` y `:nivelId` se leen con `Number(...)`, y si no son válidos se muestra "no encontrado".
- `NivelesPage` usa `NIVELES` y cuenta las categorías activas.
- `CategoriasPage` muestra la marca "Inactiva" y ofrece la baja y la reactivación reales.
- `CategoriaFormPage`:
  - persiste los cambios;
  - el nivel sale de la URL (se quita el select);
  - aplica la guarda de carga, el zod del criterio 3 y el mensaje de duplicado.
- `TalleresListPage` y `TallerFormPage`: leen `nivelId` y `categoriaId` numéricos y usan `nombreNivel`; `TallerFormPage` pierde el select de nivel.
- `TallerFiltros` y `HomePage` usan `NIVELES`.

**Tests**
- Vitest:
  - `errores.test.ts`;
  - hooks de categorías (`vi.mock('../consultas')`: filtro por nivel, `useCategoria` e invalidación);
  - `CategoriaFormPage` (alta, edición, duplicado, error genérico y carga rechazada);
  - `CategoriasPage` (baja y reactivación);
  - `AuthContext` (un cambio de usuario limpia la caché);
  - `types.test.ts` y `useTalleres.test.ts` actualizados.
- pgTAP: los casos del criterio 7.

**Docs**: en `docs/arquitectura.md`, la fila del dominio `talleres` (niveles y categorías migrados) y en Brechas las dos reglas diferidas.
En `notas.md`, el desvío de `nivel_educativo` sin timestamps.

## Fuera de alcance
- Las reglas entre taller y categoría (§5.3 y §8.4) se implementan como triggers en el corte de talleres:
  - no se puede dar de baja una categoría con talleres no inactivos, y el error informa cuántos tiene;
  - no se puede publicar un taller en una categoría inactiva ni moverlo a una.
- Talleres, recursos, etiquetas y destinatarios en la base. Navegación pública por categoría. Búsqueda. Dashboard.

## Verificación de punta a punta
1. `npm run db:reset && npm run test:db && npm run db:types && npm run typecheck && npm run lint && npm test && npm run build` → verde.
2. Con `npm run dev`, como admin:
   - crear "Salud mental" en Secundario;
   - intentar "salud méntal " en Secundario (debe dar error) y en Primario (debe pasar);
   - editar la descripción;
   - dar de baja y reactivar.
   En Studio debe quedar una fila de `registro_operacion` por cada operación.
3. Abrir `/talleres` sin sesión e iniciar sesión en la misma pestaña: en el panel se ven las categorías inactivas.
