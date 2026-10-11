# Revisión 1: corte descargas

Revisor, 2026-10-10, sobre `feat/descargas` (`git diff main...HEAD`, 3 commits: ADR 0022 + guardia, fase A y fase B). Leí
`spec.md` (criterios 1-8), `critica.md` (respuestas), `notas.md`, los ADR 0022, 0013 y 0017, la migración, los pgTAP, todo
`src/features/descargas/`, `nombreDeDescarga`, `TallerDetallePage` y los cambios de documentación. Mi perfil no me deja usar `psql` ni `docker exec`:
los privilegios los verifiqué leyendo la migración y los pgTAP, que los fijan con `has_function_privilege`, `aclexplode` y `throws_ok 42501`.

## Veredicto
**Con cambios.** No hay hallazgos críticos. La base salió bien: la RPC, la normalización, DA003/DA004, los grants, la política de Storage y la guardia
endurecida están correctos y probados (545 pgTAP en verde). Hay que corregir dos cosas importantes del frontend: el mensaje de DA003 no queda visible en
la página real y los campos con error no tienen `aria-describedby`.

## Criterios
| # | Estado | Evidencia |
|---|---|---|
| 1 Botón | Cumple | `TallerDetallePage.tsx:96-101`; tests con recursos, sin recursos y solo enlaces |
| 2 Formulario | Cumple (ver hallazgo 2) | `DescargaModal.tsx`; filtro de activos en `:140`; `esquema.ts` con los límites 100 y 200; tests de orden, Otro, Otra, cambio de localidad e inactivos |
| 3 Registro y lista | Cumple | `firmarEnlaces` (3600 s, `download: nombreDeDescarga`, orden por `orden` e `id`, `Promise.all`); lista con tipo, tamaño y total; externos con `target="_blank"` y `rel` |
| 4 Visita | Cumple | `visita.ts`: `safeParse` al leer, `Set` de módulo y `sessionStorage` con try/catch; la marca se pone después de la RPC (`useDescargarTaller.ts:27-28`); tests de recarga, sessionStorage que lanza y precarga |
| 5 Errores | Cumple a medias (hallazgo 1) | DA003 invalida `['talleres']`; DA004 invalida `['establecimientos', localidad]`; "Reintentar" solo firma (test en el hook y en el modal) |
| 6 Normalización | Cumple | RPC `:79-81`; pgTAP de OTRA con id, Docente con `cargo_otro`, PADRON con `institucion_otra`, OTRA con un id inactivo y recortes |
| 7 Seguridad | Cumple | 42501 para anon, sin marca y admin (insert/update/delete); solo el admin lee; EXECUTE para anon y authenticated y no para public; Storage: publicado sí, borrador, inactivo, huérfano y otro bucket no |
| 8 Auditoría | Cumple | `bit_or(tgtype) & 28 = 24` en la tabla; los inserts no auditan (antes y después de la RPC); UPDATE y DELETE sí; guardia por evento con cuatro autoverificaciones |

### Puntos de atención pedidos
- **RPC `registrar_descarga`:** `security definer` y `search_path = ''`, con las referencias calificadas. Normaliza antes de validar. DA003 es explícito
  (`estado = 'PUBLICADO'`, que también cubre el id inexistente) y va antes que DA004. DA004 aplica solo a PADRON, porque el id ya se anuló fuera de PADRON.
  Hace `revoke execute ... from public` y `grant` a anon y authenticated. service_role conserva EXECUTE por los privilegios por defecto, pero salta la RLS de todos modos, así que no es un hueco.
- **`talleres_select_anon`:** `objects.name` está calificado. La subconsulta corre con la RLS de anon (`recurso_select` → `taller_select`: `PUBLICADO`). Los pgTAP
  cubren los cuatro casos de la crítica, más el de otro bucket con el mismo nombre. authenticated sin marca no la hereda (test).
- **`auditoria_global`:** no se debilitó, al contrario. Antes bastaba un trigger cualquiera con `auditar()`. Ahora la unión de eventos tiene que dar 28, y las excepciones
  son por evento: `registro_operacion` con 28 (igual que antes) y `registro_descarga` solo con 4. Las autoverificaciones cubren una tabla sin trigger, una solo con update, una sin delete y otra
  completa con dos triggers, que reproduce el caso de `normativa`.
- **Imports viejos:** no queda ninguno. `src/features/descargas/DescargaModal.tsx` y `useNombresInstitucionSugeridos.ts` se borraron, y el único consumidor importa
  `components/DescargaModal`.
- **`nombreDeDescarga`:** cumple el ejemplo de la spec y su resultado queda dentro de `[\w .-]` más la extensión en minúsculas. Que no reutilice `normalizar` es un desvío
  aceptable y declarado: `normalizar` pasa todo a minúsculas.
- **Documentación:** definición §9.1-9.3, §10.3 y tabla de cambios; `arquitectura.md` (destino, dominio, migración y brechas); índice de ADR y 0006; `rules/migraciones.md`.
  No quedan menciones de `descargar-taller` salvo la histórica de la tabla de cambios.

### Desvíos de `notas.md`
- **`descargas.test.sql`:** acepto los cambios. Los `collate "default"` y `::text` corrigen tipos y no tocan las expectativas. Revisé los 93 asserts.
- **`recursos.test.sql`, prueba 14:** acepto el cambio. La excepción es estrecha: exige a la vez nombre, `cmd = 'SELECT'` y `roles = {anon}`. Una política de UPDATE, una de anon con otro
  nombre o una con `public` siguen fallando.
- **`DescargaModal.test.tsx` con `waitFor`:** acepto el cambio. Las localidades llegan por una query asíncrona, y esperar a que llegue la opción no debilita el assert.
- **Formulario recordado al enviar y no al terminar:** acepto el desvío. La spec no fija el momento, y lo que pide "después del éxito" es la **marca**, que sí está después.
- **`Cargo` como unión, PADRON sin id que lo rechaza el CHECK, institución deshabilitada sin localidad:** acepto los tres desvíos y los tres tienen test.

## Hallazgos

1. **[importante]** `src/pages/public/TallerDetallePage.tsx:41` + `src/features/descargas/hooks/useDescargarTaller.ts:34`. El mensaje de DA003 no
   queda visible en la página real. `onError` invalida `['talleres']`, `useTallerPublicado` vuelve a pedir los datos y devuelve `null`, y la página reemplaza todo por "Taller no
   encontrado". El `DescargaModal` (`:109`) se desmonta, así que "Este taller ya no está disponible" dura lo que tarda el refetch y el diálogo se cierra solo,
   sin devolver el foco. El paso 4 de la verificación de punta a punta ("aparece 'ya no está disponible'") fallaría. Además, `descargaAbierta` sigue en `true`: si el
   taller vuelve a aparecer (se republica y hay un refetch por foco), el modal se reabre solo. El test de DA003 monta el modal aislado y no lo detecta.
   **Arreglo:** invalidar al cerrar el modal y no en `onError` (por ejemplo, que `onClose` invalide si hubo DA003), o mantener el modal montado
   fuera de la rama `!taller`. Sumar un test en `TallerDetallePage.test.tsx` con DA003 que verifique el mensaje después de que el refetch resuelve.

2. **[importante]** `src/features/descargas/components/DescargaModal.tsx:190, 204, 211, 231, 270`. Los `Select` e `Input` con error tienen
   `aria-invalid`, pero no `aria-describedby`. Los `FieldError` tienen ids (`${idCargo}-error`, etc.) que nadie referencia, así que un lector de pantalla anuncia el
   alert una vez y después el campo queda "inválido" sin explicación. Pasa lo mismo con los avisos de carga (`-carga`). Es el mismo hueco de `NormativaFormPage`. **Arreglo:**
   `aria-describedby={errors.x ? \`${id}-error\` : undefined}`, como en `EstablecimientoFormPage`, y un assert con `toHaveAccessibleDescription` en al menos un campo.

3. **[menor]** `src/features/descargas/components/DescargaModal.tsx:143-148, 225-227, 259-264`. Hay tres ramas implementadas sin test: el aviso de error al
   cargar localidades, el de error al cargar establecimientos (que todavía ofrece "Otra" y "Sin institución") y el efecto que vacía la institución cuando el establecimiento
   elegido desaparece de la lista tras DA004. El test de DA004 devuelve la misma lista, así que no ejercita el vaciado. **Arreglo:** tres tests con
   `mockRejectedValue` y con una segunda respuesta de `obtenerEstablecimientos` sin el establecimiento.

4. **[menor]** `src/features/descargas/components/DescargaModal.tsx:58-69`. Si un taller que ya se registró en la visita se despublica, la firma falla (anon ya no
   ve el objeto: Storage responde 400/404). El modal muestra entonces el mensaje genérico con un "Reintentar" que nunca va a funcionar. La spec no lo pide de forma explícita (DA003 es de la
   RPC), pero el resultado contradice el criterio 5. **Arreglo opcional:** ante un error de firma, invalidar `['talleres']` o mapear 400/404 de Storage a
   "Este taller ya no está disponible".

5. **[menor]** `src/features/recursos/archivos.ts:80`. Hay un cambio fuera de alcance: `const ID_YOUTUBE =/^.../` perdió el espacio después del `=`. No
   cambia el comportamiento. Conviene restaurarlo para que el diff de `recursos` sea solo `nombreDeDescarga`.

6. **[menor]** `docs/specs/descargas/notas.md`. Los pasos 2 a 4 de la verificación de punta a punta no figuran ni como hechos ni como pendientes. Quedan para `qa`, que debe
   verificar con `suggestedFilename()` que `Guia - 1-.pdf` llega con los espacios. storage-js arma `download` con `URLSearchParams`, que convierte el espacio en `+`.
   Además, después de "Reintentar" `registro_descarga` tiene que seguir en una sola fila. Anotalo en `notas.md` cuando corra.

## Evidencia

```
$ npm run db:reset
Applying migration 20261010180000_descargas.sql...
Finished supabase db reset on branch feat/descargas.
admin@dam.local: creado / sin-permiso@dam.local: creado

$ npm run test:db
auditoria_global, descargas, recursos, storage_global, ... (17 archivos) .. ok
All tests successful.
Files=17, Tests=545   Result: PASS

$ npm test
Test Files  60 passed (60)
     Tests  1029 passed (1029)

$ npm run lint      (oxlint)
0 errores, 4 warnings. 3 son anteriores; el nuevo es DescargaModal.tsx:132 react(incompatible-library) por watch() de RHF,
el mismo patrón que TallerFormPage y ConfiguracionPage.

$ npm run typecheck (tsc -b)
sin errores
```

No corrí e2e (queda para `qa`).
