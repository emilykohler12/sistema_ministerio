# Revisión 1

Alcance: `git diff main` sin commitear en `feat/validar-redes` (`src/pages/admin/ConfiguracionPage.tsx` y `ConfiguracionPage.test.tsx`) contra
`docs/specs/validar-redes/plan.md` (#43). No hay migraciones ni otros archivos tocados; `ContactoPage`, `PublicFooter` y la base quedan fuera, como pide el plan.

## Veredicto
Cambios necesarios (uno solo, chico).

## Problemas
- **[importante]** `src/pages/admin/ConfiguracionPage.tsx:18`: el `refine` acepta `"https://"` solo (y `" https:// "`, que tras el `trim`
  queda igual). Se guarda y `/contacto` muestra un enlace roto a `https://`. El plan pide "igual que `recurso`", y `DialogoRecurso.tsx:24` exige
  `v.length > 'https://'.length`. Arreglo: `v === '' || (v.startsWith('https://') && v.length > 'https://'.length)`, con el mismo mensaje, y un caso
  en el `describe.each` que escriba `https://` y compruebe que aparece el error y que no se guarda.

## Criterios del plan

| Paso | Implementado | Test que falla sin la implementación |
|---|---|---|
| `facebook.com/x` muestra error y no guarda | sí (`redSocial`) | sí: sin el `refine`, `guardarConfiguracion` se llama |
| `http://` se rechaza | sí | sí |
| `"   "` se guarda como `''` | sí (`.trim()` antes del `refine`) | sí: sin `trim` llega `'   '` |
| `"  https://… "` se guarda sin espacios | sí | sí |
| vacío sigue siendo válido | sí | es una guardia de regresión: pasa con o sin el cambio, como corresponde |
| `aria-describedby` hacia el `FieldError` (`.claude/rules/react.md`) | sí, condicional, igual que `EstablecimientoFormPage` | sí: compara con `alerta.id`; sin el atributo falla |

Un solo esquema para los dos campos y tests con `describe.each` para Facebook e Instagram. El tipo de entrada y el de salida del esquema son iguales
(`string`), así que `useForm<FormValues>` sin genérico de salida está bien.

## Valor ya guardado inválido
Si la fila trae, por ejemplo, `facebook = 'facebook.com/x'` (datos viejos, fuera de alcance corregirlos), el admin que cambia otro campo no puede
guardar hasta que corrija la red. No es confuso: el modo de validación es `onSubmit` (no se ve el error al cargar), el mensaje sale debajo del campo, con
`aria-invalid` y `aria-describedby`, y `shouldFocusError` (por defecto en RHF; `Input` reenvía la `ref`) lleva el foco al campo. Es lo que pide el
objetivo del plan. No hay test de ese caso. No bloquea, pero un caso que cargue la fila con `facebook: 'facebook.com/x'`, edite el nombre y compruebe el
error y el foco en Facebook dejaría el comportamiento fijado. No lo pude ejecutar en el scratchpad porque el perfil del revisor no lo permite.

## Evidencia
- `npm run lint`: exit 0, 0 errores, 4 warnings, todos anteriores al cambio (`incompatible-library` por `watch` en `ConfiguracionPage.tsx:48`,
  `DescargaModal`, `TallerFormPage`; `only-export-components` en `AuthContext`).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 1422 pasan de 1422. `npx vitest run src/pages/admin/ConfiguracionPage.test.tsx`: 18 de 18.
- No se corrieron `test:e2e` ni `db:reset` (los corre el agente principal).
