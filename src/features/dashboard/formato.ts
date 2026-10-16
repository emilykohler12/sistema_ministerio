/* Formato de números del tablero (es-AR: coma decimal y punto de miles). */
export const formatoEntero = (n: number) => n.toLocaleString('es-AR')

/** "33,3 %"; sin porcentaje (total 0, padrón 0) se muestra "—". */
export function formatoPorcentaje(p: number | null) {
  return p === null ? '—' : `${p.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`
}
