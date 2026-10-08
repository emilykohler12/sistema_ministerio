---
paths:
  - "src/**/*.tsx"
---

# Componentes React

- Componentes como funciones nombradas y exportadas (`export function TallerCard`), no default export.
- UI base en `src/shared/components/ui/`. Reutilizá antes de crear; si creás uno genérico, va ahí.
- Componentes de un dominio en `src/features/<dominio>/components/`. Pantallas en `src/pages/`.
- Datos siempre vía hooks de `src/features/<dominio>/hooks/` (React Query). Nada de fetch en componentes.
- Formularios: react-hook-form + zod (`zodResolver`). Errores con `FieldError`.
- Estilos con Tailwind y `cn()` de `@/shared/lib/utils`.
- Accesibilidad: labels asociados, foco visible, textos alternativos, navegable con teclado.
- Textos de la interfaz en español rioplatense neutro ("Elegí", "Ingresá").
