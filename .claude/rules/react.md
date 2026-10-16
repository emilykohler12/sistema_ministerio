---
paths:
  - "src/**/*.tsx"
---

# Componentes React

- Componentes como funciones nombradas y exportadas (`export function TallerCard`), no default export.
- UI base en `src/shared/components/ui/`. Reutilizá antes de crear; si creás uno genérico, va ahí.
- Componentes de un dominio en `src/features/<dominio>/components/`. Pantallas en `src/pages/`.
- Datos siempre vía hooks de `src/features/<dominio>/hooks/` (React Query). Nada de fetch en componentes, ni llamadas
  directas a `consultas.ts`.
- Formularios: react-hook-form + zod (`zodResolver`). Errores con `FieldError`.
- Estilos con Tailwind y `cn()` de `@/shared/lib/utils`.
- Accesibilidad: labels asociados, foco visible, textos alternativos, navegable con teclado.
- Textos de la interfaz en español rioplatense neutro ("Elegí", "Ingresá").

## Trampas que ya se repitieron (las encontró el revisor o el crítico en varios cortes)

- Carga: `isPending`, no `isLoading`. Sin red, la primera carga queda `paused`, `isLoading` es false y `data` undefined.
- Cada query que usa la pantalla, **incluidas las secundarias** (p. ej. localidades en un formulario), tiene su rama de error
  con mensaje **y su test**. Un error nunca se muestra como "no encontrado", "Cargando..." eterno, estado vacío o "0".
- Formulario de edición: no se muestra hasta que la carga terminó bien; si no, guardar pisa la fila con vacíos. `useForm({ values: data })`.
- Un id de ruta inválido o inexistente muestra "no encontrado" (`idDeRuta` de `@/shared/lib/rutas`).
- Campo con error: `aria-describedby` hacia el id de su `FieldError` (molde: `EstablecimientoFormPage`). Si un `setError` marca
  dos campos, limpialos juntos (`clearErrors([a, b])`) al cambiar cualquiera.
- Entrada y salida del formulario distintas: `useForm<Entrada, unknown, Salida>`, sin `as unknown as Resolver` ni un segundo `parse`.
- Enums de la base: `Constants.public.Enums.<enum>` de `database.ts`; las etiquetas en un `Record<Enum, string>` con `satisfies`.
  Nunca la lista escrita a mano.
- Mensajes de error de un dominio (DA00x) en su `errores.ts`, no copiados en cada pantalla.
- `key` estable (id), nunca el texto visible: dos elementos con el mismo nombre repiten la key.
