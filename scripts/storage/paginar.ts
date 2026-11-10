// Lectura paginada por clave (keyset) de las rutas referenciadas. Puro: la página se inyecta, sin imports de supabase.
//
// Por offset, borrar una fila con id menor mientras se lee corre las siguientes y una se salta; su ruta quedaría fuera de las
// referencias y el objeto se borraría. Por clave se pide siempre `id > ultimoId`, así que un borrado no mueve nada.

export interface Pagina<T> {
  data: T[] | null
  error: Error | null
}

export async function traerPorClave<T extends { id: number }>(
  pagina: (ultimoId: number, limite: number) => PromiseLike<Pagina<T>>,
  limite: number,
): Promise<T[]> {
  const filas: T[] = []
  let ultimoId = 0
  for (;;) {
    const { data, error } = await pagina(ultimoId, limite)
    // Falla cerrada: un error en cualquier página descarta todo y quien llama no borra nada.
    if (error) throw error
    // Se corta con una página vacía, no con una corta, y se avanza por el último id RECIBIDO: el max_rows del servidor
    // (configurable en la nube) puede ser menor que `limite`.
    if (!data?.length) return filas
    filas.push(...data)
    ultimoId = data[data.length - 1].id
  }
}
