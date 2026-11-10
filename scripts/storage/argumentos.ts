// Argumentos de `storage:limpiar`. Puro: sin imports de supabase.

export const EDAD_MINIMA_POR_DEFECTO = 60

export function leerArgumentos(args: string[]): { aplicar: boolean; edadMinima: number } {
  let aplicar = false
  let edadMinima = EDAD_MINIMA_POR_DEFECTO
  for (const arg of args) {
    if (arg === '--aplicar') aplicar = true
    // El destino remoto lo resuelve `resolverDestino` con esta misma lista.
    else if (arg === '--confirmar' || arg.startsWith('--confirmar=')) continue
    else if (arg.startsWith('--edad-minima=')) {
      const valor = arg.slice('--edad-minima='.length)
      if (!/^\d+$/.test(valor)) throw new Error(`--edad-minima debe ser un entero de minutos, 0 o más: ${arg}`)
      edadMinima = Number(valor)
    } else if (arg.startsWith('--')) throw new Error(`Opción desconocida: ${arg}`)
    else throw new Error(`Sobra un argumento: ${arg}`)
  }
  return { aplicar, edadMinima }
}
