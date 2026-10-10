import { Link } from 'react-router-dom'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

/** Pantalla para una URL del panel con un id inválido o inexistente; `volverA` es la lista a la que se regresa. */
export function NoEncontrado({ titulo, volverA }: { titulo: string; volverA: string }) {
  return (
    <EmptyState
      title={titulo}
      description="Revisá el enlace o volvé a la lista."
      action={
        <Link to={volverA}>
          <Button size="sm" variant="outline">
            Volver
          </Button>
        </Link>
      }
    />
  )
}
