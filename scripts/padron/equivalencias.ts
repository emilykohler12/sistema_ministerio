// Equivalencias de localidad: el nombre que trae el CSV (normalizado: minúsculas, sin tildes) -> el nombre exacto de
// una localidad de la base. Se usan solo cuando el nombre del CSV no coincide por sí mismo (ADR 0019).
//
// Vacío hasta tener la muestra real (C-08). Ejemplo de entrada:
//   'pto. iguazu': 'Puerto Iguazú',
export const EQUIVALENCIAS: Record<string, string> = {}
