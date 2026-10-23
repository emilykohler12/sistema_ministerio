import { useCallback, useEffect, useRef, useState } from 'react'

const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

/** Cada cuánto se compara la hora del sistema con la última actividad. */
const PERIODO_REVISION_MS = 1000

interface Opciones {
  /** Con `false` no hay listeners ni temporizadores. */
  activo: boolean
  /** Inactividad tras la cual vence la sesión. */
  limiteMs: number
  /** Cuánto antes de vencer se muestra el aviso. */
  avisoMs: number
  onVencida: () => void
}

/**
 * Detecta la inactividad del usuario. Mide con `Date.now()` y no con la cuenta de un `setTimeout`: el navegador
 * demora los temporizadores de las pestañas en segundo plano, y así el vencimiento se detecta apenas corre la revisión.
 * Con el aviso visible, la actividad ambiente no lo oculta: solo `extender` (decisión explícita del usuario).
 * `venceEn` es la hora (ms desde epoch) en que vence la sesión; es `null` mientras no hay aviso.
 */
export function useInactividad({ activo, limiteMs, avisoMs, onVencida }: Opciones) {
  const [venceEn, setVenceEn] = useState<number | null>(null)
  const ultimaActividad = useRef(0)
  const avisoVisible = useRef(false)
  // Ref para que un `onVencida` nuevo en cada render no reinicie el contador.
  const onVencidaRef = useRef(onVencida)
  useEffect(() => {
    onVencidaRef.current = onVencida
  })

  // Del efecto: permiten que `extender` compare con el límite antes de reiniciar.
  const revisarRef = useRef<(() => void) | null>(null)
  const vencidaRef = useRef(false)

  const extender = useCallback(() => {
    // Si el tiempo ya pasó y el tic todavía no corrió (equipo dormido), esto cierra en vez de extender.
    revisarRef.current?.()
    if (vencidaRef.current) return
    ultimaActividad.current = Date.now()
    avisoVisible.current = false
    setVenceEn(null)
  }, [])

  useEffect(() => {
    if (!activo) return
    ultimaActividad.current = Date.now()
    avisoVisible.current = false
    vencidaRef.current = false

    function revisar() {
      if (vencidaRef.current) return
      const inactivo = Date.now() - ultimaActividad.current
      if (inactivo >= limiteMs) {
        vencidaRef.current = true
        clearInterval(intervalo)
        avisoVisible.current = false
        setVenceEn(null)
        onVencidaRef.current()
      } else if (inactivo >= limiteMs - avisoMs && !avisoVisible.current) {
        avisoVisible.current = true
        setVenceEn(ultimaActividad.current + limiteMs)
      }
    }

    function alActividad() {
      // Primero se comprueba el límite: un clic después de los 30 minutos no puede reiniciar el plazo.
      revisar()
      if (vencidaRef.current || avisoVisible.current) return
      ultimaActividad.current = Date.now()
    }

    revisarRef.current = revisar
    const intervalo = setInterval(revisar, PERIODO_REVISION_MS)
    // En captura y sobre window: `scroll` no burbujea desde los elementos con desplazamiento propio.
    for (const tipo of EVENTOS_ACTIVIDAD) {
      window.addEventListener(tipo, alActividad, { capture: true, passive: true })
    }
    // Al volver a la pestaña, revisar enseguida sin esperar al próximo tic.
    document.addEventListener('visibilitychange', revisar)

    return () => {
      clearInterval(intervalo)
      for (const tipo of EVENTOS_ACTIVIDAD) {
        window.removeEventListener(tipo, alActividad, { capture: true })
      }
      document.removeEventListener('visibilitychange', revisar)
      revisarRef.current = null
      avisoVisible.current = false
      setVenceEn(null)
    }
  }, [activo, limiteMs, avisoMs])

  return { aviso: venceEn !== null, venceEn, extender }
}
