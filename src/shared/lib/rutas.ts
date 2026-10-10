/** Máximo de un `int` de Postgres: un id mayor no puede existir y la base respondería 22003. */
const ID_MAXIMO = 2147483647

/** Id numérico de un parámetro de la URL: entero positivo hasta el máximo de un `int`, o `null` si no lo es (o no está). */
export function idDeRuta(param: string | undefined | null): number | null {
  if (param === undefined || param === null || !/^[1-9]\d*$/.test(param)) return null
  const id = Number(param)
  return Number.isSafeInteger(id) && id <= ID_MAXIMO ? id : null
}
