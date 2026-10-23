import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { Dialog } from '@/shared/components/ui/Dialog'
import { formatearRestante, mensajeRestante } from '../restante'

interface AvisoInactividadProps {
  /** Hora (ms desde epoch) en que vence la sesión. */
  venceEn: number
  onSeguir: () => void
}

export function AvisoInactividad({ venceEn, onSeguir }: AvisoInactividadProps) {
  const [ahora, setAhora] = useState(() => Date.now())
  const botonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [])

  // El efecto del Dialog (que enfoca el primer elemento, el botón "Cerrar") corre antes que este: acá se corrige.
  useEffect(() => {
    botonRef.current?.focus()
  }, [])

  const restante = venceEn - ahora

  return (
    <Dialog
      open
      role="alertdialog"
      onClose={onSeguir}
      title="Tu sesión está por cerrarse"
      description="Por seguridad, la sesión se cierra tras un rato de inactividad. Si querés continuar, seguí conectado."
    >
      <p className="text-sm text-gray-700">
        Se cerrará en{' '}
        <span role="timer" className="font-semibold tabular-nums">
          {formatearRestante(restante)}
        </span>
      </p>
      <p role="status" className="sr-only">
        {mensajeRestante(restante)}
      </p>
      <div className="flex justify-end pt-4">
        <Button ref={botonRef} onClick={onSeguir}>
          Seguir conectado
        </Button>
      </div>
    </Dialog>
  )
}
