import { Button } from '@/shared/components/ui/Button'

interface VerTodosProps {
  expandido: boolean
  onAlternar: () => void
  /** "Ver todos" / "Ver todas", según el género de lo que se lista. */
  etiqueta: string
}

export function VerTodos({ expandido, onAlternar, etiqueta }: VerTodosProps) {
  return (
    <Button variant="outline" size="sm" className="mt-3" aria-expanded={expandido} onClick={onAlternar}>
      {expandido ? 'Ver menos' : etiqueta}
    </Button>
  )
}
