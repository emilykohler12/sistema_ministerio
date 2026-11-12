# Revisión 1

Diff revisado: cambios sin commitear de `e2e/padron.spec.ts` y `e2e/helpers.ts` (`git diff HEAD -- e2e/`). El `main` local
está detrás de `HEAD` (no tiene el merge de #66), así que `git diff main` también trae logo-institucional, que no es de esta
rama.

## Veredicto
Aprobado

## Problemas
Ninguno que afecte corrección ni requisitos.

## Verificado sin problemas
1. **Paso 1 del plan, cobertura.** `grep "'Editar'" e2e/` devuelve un único clic en `padron.spec.ts`, el de adentro del helper
   (línea 21). Los dos clics que había (duplicados, ex línea 69; cambio de localidad, ex línea 83) ahora pasan por
   `abrirEdicionEstablecimiento` (líneas 79 y 93). No queda ningún clic en «Editar» fuera del helper.
2. **Encabezado y nivel.** `EstablecimientoFormPage.tsx:80` y `:127`: `<h1>{titulo}</h1>` con `titulo = 'Editar establecimiento'`
   cuando hay establecimiento. El `expect` pide `name: 'Editar establecimiento', level: 1`, que coincide. Ningún encabezado de
   `EstablecimientosPage` («Establecimientos») contiene ese texto, y el breadcrumb no es un heading.
3. **La espera es suficiente.** `Formulario` monta solo cuando `localidades` y `establecimiento` cargaron bien (líneas 48-61), y los
   valores van en `defaultValues` al montar. Con el `<h1>` visible, los campos ya tienen sus valores y un `fill` o `selectOption`
   posterior no se pisa.
4. **El mecanismo del comentario existe.** `EstablecimientosPage.tsx:61-62` tiene un `<Select id="localidad">` con label
   «Localidad», y `router.tsx:48` carga `EstablecimientoFormPage` con `lazy`. Si `selectOption({ label: 'Apóstoles' })` cayera en
   el filtro, cambiaría `?localidad=` de la lista y «Guardar cambios» no aparecería. El comentario dice «puede resolverse» y no
   afirma que la carrera se haya visto, lo que va con que no se reprodujo en 60 + 30 ejecuciones.
5. **Paso 2, `loginAdmin`.** `timeout: 15_000` solo en el `expect` del heading «Dashboard»; el `toHaveURL` y las otras esperas no
   cambian. El timeout de cada test es de 60 s (`playwright.config.ts:10`), así que 15 s entran con margen. No tapa fallos: si el
   encabezado no aparece, el test falla igual, solo que a los 15 s en lugar de a los 5. El comentario dice «causa no verificada,
   #64», lo que es exacto.
6. **Paso 3.** Ningún archivo de `src/` cambió. Solo cambiaron los dos e2e y se agregó `docs/specs/e2e-padron-carrera/`.
7. **Otros specs con el mismo patrón** (solo para registrar; quedan fuera de alcance):
   - `talleres-admin.spec.ts:42-44`: clic en «Editar» seguido de `getByLabel('Estado')` y `getByLabel('Nombre', { exact: true })`
     sin esperar el encabezado. En `TalleresListPage` el único label es el buscador «Buscar por nombre o etiqueta», que no coincide
     con «Estado» (subcadena) ni con «Nombre» (exacto). Así que Playwright espera solo el campo del formulario y no hay carrera de
     label ambiguo. Tampoco hace falta un issue.
   - `categorias.spec.ts:34-35` y `normativas-admin.spec.ts:27-29` ya esperan el `<h1>`.
   - Los demás `getByLabel('Localidad')` sin `dlg.` (`padron.spec.ts:11` y `:29`, `sin-vincular.spec.ts:9`, `:129` y `:189`,
     `dashboard.spec.ts:79`, `descargas.spec.ts:64`) vienen después de un `page.goto` directo (o de `irASinVincular`, que hace
     `goto` y espera el encabezado). Sin navegación por clic, no hay carrera.
8. **Sin pruebas de mutación de mi parte.** El plan pide quitar el `expect` y ver si falla bajo carga. Eso exige Playwright, y lo
   corre quien implementa (el revisor no puede correrlo).

## Evidencia
- `npm run lint`: 0 errores, 3 advertencias que ya existían (`AuthContext.tsx:74`, `DescargaModal.tsx:133`, `TallerFormPage.tsx:117`),
  ninguna en `e2e/`.
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 111 archivos, 1915 tests, todos pasan.
- Playwright y `db:reset`: no los corrí (los corre quien implementa).
