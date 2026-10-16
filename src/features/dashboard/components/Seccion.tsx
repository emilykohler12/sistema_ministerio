import { useId, type ReactNode } from 'react'
import { Card } from '@/shared/components/ui/Card'

interface SeccionProps {
  titulo: string
  descripcion?: string
  children: ReactNode
}

/** Región del tablero con nombre accesible (su título). */
export function Seccion({ titulo, descripcion, children }: SeccionProps) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <Card>
        <h2 id={id} className="text-base font-semibold text-primary-700">
          {titulo}
        </h2>
        {descripcion && <p className="mt-1 text-sm text-gray-500">{descripcion}</p>}
        <div className="mt-4 overflow-x-auto">{children}</div>
      </Card>
    </section>
  )
}
