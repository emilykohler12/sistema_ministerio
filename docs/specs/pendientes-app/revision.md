# Revisión 1

Alcance: cambios sin commitear de `fix/pendientes-app` contra `docs/specs/pendientes-app/plan.md` (pasos 1 a 4). No revisé
`.claude/`, `docs/specs/pendientes-hooks/`, el logo ni las redes.

## Veredicto
Cambios necesarios

## Problemas

- **[importante]** `src/pages/admin/normativas/NormativaFormPage.tsx:171` y `:176-183`: los inputs de número y año no tienen
  `aria-describedby`. Ante un 23505, el año queda `aria-invalid="true"` con `message: ''`, así que no hay `#anio-error` y
  ningún atributo apunta a `#numero-error`. Un lector de pantalla anuncia el `role="alert"` una sola vez, cuando aparece. Si
  después el usuario vuelve a enfocar el año, escucha "Año, entrada no válida" y no recibe ninguna explicación. El plan pide
  el "mismo patrón que `EstablecimientoFormPage`", y esa pantalla sí pone `aria-describedby={errors.x ? 'x-error' : undefined}`
  (líneas 150, 163 y 174). **Arreglo:** en el número, `aria-describedby={errors.numero ? 'numero-error' : undefined}`. En el
  año, `aria-describedby={errors.anio ? (errors.anio.message ? 'anio-error' : 'numero-error') : undefined}`. En el test del
  23505, agregar `expect(anio()).toHaveAccessibleDescription('Ya existe una normativa con ese número y año.')`, y lo mismo
  para el número.

- **[importante]** `src/pages/public/ContactoPage.tsx:19-20` y `:52-54`: no hay rama para el error de carga. Si
  `useConfiguracion()` falla, `isPending` pasa a `false` y `config` queda `undefined`. Entonces `hayDatos` es `false` y la
  pantalla muestra "Todavía no hay datos de contacto", que es falso: los datos existen pero no se pudieron leer. Es el mismo
  hueco de "error de carga sin mostrar" que ya apareció en otros cortes. **Arreglo:** sacar `isError` y `refetch` del hook y,
  si hay error, mostrar un aviso (por ejemplo `ErrorFallback onRetry={() => void refetch()}`, o un texto "No pudimos cargar
  los datos de contacto"). Agregar un test con `mockRejectedValue` que verifique que el texto de "sin datos" no aparece.

- **[menor]** `src/pages/admin/normativas/NormativaFormPage.tsx:119-120`: los dos errores del par se limpian por separado.
  Lo comprobé con un formulario mínimo de RHF + zodResolver en el scratchpad, con la misma configuración (modo `onSubmit`
  por defecto):
  - Si el usuario corrige el número, el error del número se va, pero el año sigue con `aria-invalid` y borde rojo hasta que
    reintenta.
  - Si corrige el año, el mensaje "Ya existe…" queda bajo el número.
  - Al reintentar, `handleSubmit` vuelve a correr el resolver y limpia los dos, así que el 23505 no bloquea el reintento.

  Ningún test cubre "corregir y reintentar". **Arreglo:** cuando cambie cualquiera de los dos campos y el error sea el de
  duplicado, llamar `clearErrors(['numero', 'anio'])`. Por ejemplo, con `setError(..., { type: 'duplicada', ... })` y un
  `onChange` en las opciones de `register`. Agregar un test: 23505, se cambia el número, ninguno de los dos queda
  `aria-invalid`, el segundo guardado resuelve y se navega a la lista.

- **[menor]** `docs/specs/pendientes-app/`: el plan pide pasar por `qa` con `db:reset` antes y después, y no hay ningún
  registro de esa verificación (no existe `notas.md`). Es el mismo patrón de verificación manual sin anotar que se repite en
  el proyecto.

Revisé y está bien:
- **Paso 1:** se muestran solo los campos que tienen valor. `tel:` quita los espacios y `mailto:` está bien. El subtítulo
  usa `config.nombre`, con "nosotros" como respaldo. Mientras carga se muestra `ListSkeleton` con `role="status"` y
  `aria-label="Cargando"`, el mismo patrón que `AdminLayout`. El texto de CABA ya no está.
- **Paso 2:** `esNormativaDuplicada` es pura y está bien probada con objetos, `Error`, `null`, string y número. Los demás
  errores siguen por `setErrorGuardado`. El test del 23505 comprueba que hay un solo `alert`, que está bajo el número y que
  no existe `#normativa-error`.
- **Paso 3:** la key es posicional. Confirmé en el scratchpad que React 19 hace `console.error` con keys duplicadas, así que
  `Breadcrumb.test.tsx` fallaría con el código anterior.
- **Paso 4:** `package-lock.json` solo cambia `source-map-js` de 1.2.1 a 1.2.2 (versión, `resolved` e `integrity`).
  `npm audit` da 0.
- No hay cambios fuera del alcance.

## Evidencia

- `npm run lint`: 0 errores y 4 warnings, todos en archivos que el cambio no toca (`AuthContext.tsx:71`, `DescargaModal.tsx:78`,
  `TallerFormPage.tsx:117`, `ConfiguracionPage.tsx:43`).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 53 archivos y 918 tests, todos pasan.
- `npm audit`: `found 0 vulnerabilities`.
- `npm run build`: compila sin errores (`✓ built in 3.60s`).
- Prueba de RHF en el scratchpad: después de editar el número, `n=null a=true`; después de reintentar, `n=null a=null`.

## Respuesta (agente principal)

- 1 (`aria-describedby`): acepto. Número → `numero-error`; año → `anio-error` o, sin mensaje propio, `numero-error`. Test con `toHaveAccessibleDescription`.
- 2 (error de carga en `/contacto`): acepto. `ErrorFallback` con "Reintentar" antes de la rama de carga, más un test con la consulta rechazada.
- 3 (limpieza a medias): acepto. El error de duplicado lleva `type: 'duplicada'`; cambiar número o año limpia los dos. Test que corrige, reintenta y navega.
- 4 (registro de `qa`): acepto. `qa.md` con 25 e2e en verde y `db:reset` antes y después.
- Tests: 918 → 921.
