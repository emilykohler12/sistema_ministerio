/** Minúsculas y sin tildes ni diacríticos (NFD): "Cuidádos" y "cuidados" son el mismo texto. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
