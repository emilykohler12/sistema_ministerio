# Revisión 1

Alcance: `git diff main` (sin commitear) sobre `src/pages/public/ContactoPage.tsx` y `ContactoPage.test.tsx`, contra `plan.md` (#24).
No hay archivos nuevos fuera de `docs/specs/redes-contacto/`. No se tocó nada fuera del plan.

## Veredicto
Cambios necesarios (uno solo, de una clase CSS)

## Problemas
- **[importante]** `src/pages/public/ContactoPage.tsx:61` y `:68`: el texto del enlace es la URL completa, una sola "palabra" sin espacios,
  dentro de `DatoDeContacto` (`flex items-center` con el `<div>` interno sin `min-w-0`). Una URL larga y real (p. ej.
  `https://www.facebook.com/MinisterioDeEducacionDeMisiones`) no se corta. A 320 px el `dd` deja unos 220 px útiles
  (320 − `px-4` − `p-4` − borde − ícono − `gap-3`), así que la tarjeta desborda y la página hace scroll horizontal (WCAG 1.4.10, reflow).
  El correo ya tenía el mismo riesgo, pero era más corto; las URL de redes son las que casi seguro lo disparan. **Arreglo:** `break-all`
  en los dos `<a>` (o `min-w-0` en el `<div>` de `DatoDeContacto` más `break-words` en el `dd`, que cubre también el correo). Para verificarlo:
  el e2e de regresión a 320 px con una URL de unos 55 caracteres, comprobando que `scrollWidth <= clientWidth`.

## Requisitos del plan
| Paso | Estado | Test |
|---|---|---|
| 1. Cada red es un enlace con `target="_blank"` y `rel="noreferrer"` cuando tiene valor | Hecho | `muestra Facebook e Instagram como enlaces externos...` comprueba `href`, `target` y `rel` de los dos |
| 1. No aparece si está vacía | Hecho | `oculta la red social que no tiene valor` (Instagram vacío; Facebook vacío lo cubre el test anterior por simetría y `sin ningún dato`) |
| 1. Con solo redes no se muestra el estado vacío | Hecho | `con solo las redes cargadas no muestra...` |
| 2. `hayDatos` incluye `facebook` e `instagram` | Hecho (`:21-23`) | El caso de solo Instagram falla si se saca `instagram` de `hayDatos` (no se renderiza el `dl`); el de solo Facebook, si se saca `facebook` |
| 3. Mismo patrón del footer; ícono de marca o `Globe` | Hecho | `lucide-react` 1.48 ya no trae `Facebook` ni `Instagram` (no están en `dist/esm/icons`): `Globe` es la opción que pedía el plan |
| 4. Rama y `Closes #24` | Rama correcta; el PR queda para el agente principal | n/a |

Los tests nuevos fallan sin la implementación: los tres buscan primero un nodo que solo existe con el cambio (`findByRole('link', …)`,
`findByText('Instagram')`, `findByText('Facebook')`). El de "oculta" también falla si Instagram se renderizara sin condición, porque la base
trae `instagram: ''`.

## Seguridad de los href
- El valor sale de `configuracion` (texto del admin, columna `varchar not null default ''`) y va directo a `href`. React 19 bloquea las URL
  `javascript:` y `rel="noreferrer"` implica `noopener`: no hay riesgo nuevo de XSS ni de tabnabbing.
- Ya conocido y fuera de alcance (no es nuevo): el zod de `ConfiguracionPage` (`facebook: z.string()`, sin `trim` ni `url`) acepta
  `facebook.com/x` sin esquema, que el SPA resolvería como ruta relativa (`/facebook.com/x`), y `"   "`, que se mostraría como un enlace vacío.
  Le pasa igual al footer: va en el issue aparte que menciona el plan.

## Accesibilidad
- El ícono lleva `aria-hidden`; la etiqueta "Facebook" / "Instagram" está en el `dt` y el nombre del enlace es la URL: se entiende.
- El desborde de arriba es el único hallazgo.

## Evidencia
- `npm run lint`: 0 errores, 4 avisos previos en archivos que no tocó este cambio (`AuthContext`, `TallerFormPage`, `DescargaModal`, `ConfiguracionPage`).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 1412 tests pasan (1412).
- `npx vitest run src/pages/public/ContactoPage.test.tsx`: 10 de 10.
- No corrí `test:e2e` ni `db:reset` (los corre el agente principal).
