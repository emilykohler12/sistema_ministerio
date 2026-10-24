import { type RefObject, useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Trampas activas, de la más antigua a la más nueva. Con diálogos apilados (p. ej. el aviso de inactividad sobre un
 * formulario abierto) solo la de arriba atiende Escape y Tab: si no, Escape cerraría los dos.
 */
interface Entrada {
  /** A dónde vuelve el foco cuando esta trampa deja de ser la de arriba y se cierra. */
  restaurar: HTMLElement | null
}
const pila: Entrada[] = []

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  // `onClose` va en un ref: si fuera una dependencia, una función nueva en cada render reiniciaría el efecto y el foco
  // volvería al primer elemento mientras se escribe.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return

    const entrada: Entrada = { restaurar: document.activeElement as HTMLElement | null }
    pila.push(entrada)

    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE)
    focusables[0]?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (pila[pila.length - 1] !== entrada) return
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !container) return

      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const posicion = pila.indexOf(entrada)
      const eraLaDeArriba = posicion === pila.length - 1
      pila.splice(posicion, 1)
      if (eraLaDeArriba) {
        entrada.restaurar?.focus()
      } else {
        // Se cerró una de abajo: el foco se queda en la de arriba, que hereda el destino para cuando se cierre.
        pila[posicion].restaurar = entrada.restaurar
      }
    }
  }, [active, ref])
}
