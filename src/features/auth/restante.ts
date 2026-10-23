/** `m:ss` redondeando los segundos hacia arriba, sin bajar de `0:00`. */
export function formatearRestante(ms: number): string {
  const segundos = Math.max(0, Math.ceil(ms / 1000))
  const minutos = Math.floor(segundos / 60)
  return `${minutos}:${String(segundos % 60).padStart(2, '0')}`
}

/**
 * Texto para el lector de pantalla. Cambia solo en cuatro hitos (2 min, 1 min, 30 s y 10 s) para que la
 * región en vivo no hable cada segundo.
 */
export function mensajeRestante(ms: number): string {
  if (ms > 60_000) return 'Quedan 2 minutos para que se cierre tu sesión.'
  if (ms > 30_000) return 'Queda 1 minuto para que se cierre tu sesión.'
  if (ms > 10_000) return 'Quedan 30 segundos para que se cierre tu sesión.'
  return 'Quedan 10 segundos para que se cierre tu sesión.'
}
