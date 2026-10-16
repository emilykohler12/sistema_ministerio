# Revisión 1: fix-ruta-recursos

Revisé el diff sin commitear de `fix/ruta-recursos` contra `main`, comparándolo con `plan.md` y con la sección Respuesta de `critica.md`.

## Veredicto
Cambios necesarios (uno solo, chico: falta un test).

## Problemas

1. **[importante]** `src/features/recursos/consultas.ts:30` y `:41`: el núcleo del fix no tiene ningún test que falle si se revierte.
   Todos los tests mockean `consultas`. `secuencias.test.ts` solo comprueba que se *pasa* `rutaAnterior`, y que se usa la ruta que *devuelve* el mock.
   Si se borra la línea `consulta = consulta.eq('ruta_archivo', rutaAnterior)`, o si `.select('ruta_archivo')` vuelve a ser `.select('id')`,
   Vitest sigue en verde. `e2e/recursos.spec.ts` también, porque usa una sola pestaña y la ruta de la caché coincide con la de la base.
   Así, una regresión del *lost update* o del huérfano pasa sin que nada avise.
   **Arreglo:** agregar `src/features/recursos/consultas.test.ts` con un `supabase.from` mockeado como cadena, siguiendo el molde de
   `src/features/descargas/consultas.test.ts`. Tiene que afirmar tres cosas:
   - Con `rutaAnterior`, `actualizarRecurso` llama a `.eq('id', id)` y a `.eq('ruta_archivo', rutaAnterior)` antes de `.select().single()`.
     Sin `rutaAnterior` (Editar), solo llama a `.eq('id')`.
   - `eliminarFilaRecurso` pide `.select('ruta_archivo')` y devuelve `data.ruta_archivo`, incluido `null`.
   - Las dos lanzan el `error` tal como llega (`{ code: 'PGRST116' }`).

   No hace falta probar contra la base: la crítica ya dejó fuera de Vitest que PostgREST conteste PGRST116.

## Verificado sin observaciones

- **Paso 1, baja.** `eliminarFilaRecurso` hace `delete().eq('id').select('ruta_archivo').single()` y devuelve `string | null`. `eliminarRecurso`
  conserva la firma y borra la ruta de la base, no la de `recurso.ruta_archivo`. Un enlace (`null`) no toca Storage. Test nuevo:
  `secuencias.test.ts` "borra la ruta que la fila tenía en la base, no la de la caché", que falla con el código anterior. El caso del enlace ahora
  devuelve `null` desde el mock.
- **Paso 2, reemplazo.** `actualizarRecurso(id, cambios, rutaAnterior?: string)` recibe la firma concreta que pidió la crítica.
  `reemplazarArchivo` pasa `anterior`, que nunca es `null` porque la guarda de la línea 46 corta antes. Ante PGRST116, `compensar` borra el archivo
  nuevo, porque `code` no está vacío y `esRechazoDelServidor` da `true`. El viejo no se borra porque `throw` sale antes de `borrarOAvisar(anterior)`.
  Repasé las carreras posibles:
  - Reemplazo contra baja, en cualquier orden: ninguna deja un huérfano ni una fila que apunte a un archivo inexistente.
  - Dos reemplazos simultáneos: gana uno y el otro compensa.

  El test de `:239` usa PGRST116 y afirma que se borra solo el archivo nuevo. La aserción de `:235` incluye `RUTA_VIEJA`.
- **Paso 3, errores.** `codigosDeError` suma `code`. El único otro consumidor es `normativas/errores.ts`, que resuelve `23505` antes y después solo
  busca `'413'`/`'415'`. Ningún SQLSTATE (5 caracteres) ni `PGRST…` coincide con esos valores. Los `code` de `StorageApiError` en
  storage-js tampoco coinciden: son cadenas como `EntityTooLarge`, y el número sigue viajando en `statusCode`. `mensajeDeErrorRecurso` traduce
  PGRST116 al texto neutral acordado. Hay tests en `erroresStorage.test.ts`, que cubren `code` solo, `status` + `code` y `code: null`, y en
  `errores.test.ts`.
- **Paso 4, hooks.** `onSettled: invalidar` está en `useActualizarRecurso`, `useReemplazarArchivo` y `useEliminarRecurso`. `useCrearEnlace` y
  `useOrdenarRecursos` siguen con `onSuccess`, y sus tests "no invalida" siguen ahí. Los tres tests de falla ahora afirman que se invalida.
  **No desmonta el error** (ver memoria, descargas DA003): `avisos` vive en `Pantalla`, `useTaller` conserva `data` al refetchear y el taller
  sigue existiendo. El diálogo de edición toma el recurso del estado `dialogo`, no de la lista, así que no se cierra si el recurso desaparece
  al recargar.
- **Paso 5, docs.** La brecha de `docs/arquitectura.md` se quitó, y la excepción a la 0023 quedó escrita con su motivo en `plan.md`.
- **`RecursosPage.test.tsx`.** Solo cambian los mocks: `eliminarFilaRecurso` devuelve la ruta. Además, la aserción del reemplazo se endurece:
  ahora exige `'5/viejo-1.pdf'` como tercer argumento. No se relajó ninguna aserción.
- **Seguridad.** No hay migración, política ni permiso nuevo, tampoco secretos. PGRST116 también puede venir de una RLS que filtra (una sesión
  sin `admin`). En ese caso el UPDATE no ocurrió y compensar está bien, como dice la crítica (P1).
- **Alcance.** Fuera de `src/` y `docs/` solo cambia la memoria del crítico (`.claude/agent-memory/critico/`).

No pude confirmar en vivo que PostgREST conteste PGRST116: el perfil del revisor bloquea `npx supabase status`. El caller corre `test:e2e`.

## Evidencia

- `npm run lint`: 0 errores y 4 warnings previos, en archivos que este cambio no toca (`DescargaModal.tsx:133`, `AuthContext.tsx:71`,
  `TallerFormPage.tsx:117`, `ConfiguracionPage.tsx:43`).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 61 archivos y 1043 tests, todos en verde.
- No se corrieron `test:e2e` (lo corre el caller) ni `test:db` (no hay migración).
