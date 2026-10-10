/** Id numérico de un parámetro de la URL: entero positivo, o `null` si no lo es (o no está). */
export function idDeRuta(param: string | undefined | null): number | null {
  if (param === undefined || param === null || !/^[1-9]\d*$/.test(param)) return null
  const id = Number(param)
  return Number.isSafeInteger(id) ? id : null
}
