import { Link } from 'react-router-dom'
import { Button } from '@/shared/components/ui/Button'
import { EmptyState } from '@/shared/components/ui/EmptyState'

/** Pantalla para una URL del panel de talleres con un id inválido o inexistente. */
export function NoEncontrado({ titulo, volverA = '/admin/talleres' }: { titulo: string; volverA?: string }) {
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
