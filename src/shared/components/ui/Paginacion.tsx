import { Button } from './Button'

interface PaginacionProps {
  pagina: number
  totalPaginas: number
  onCambiar: (pagina: number) => void
  /** Apaga los dos botones, por ejemplo mientras llegan los datos de la página nueva. */
  deshabilitado?: boolean
}

export function Paginacion({ pagina, totalPaginas, onCambiar, deshabilitado = false }: PaginacionProps) {
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-4">
      <Button variant="outline" size="sm" disabled={deshabilitado || pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-gray-600">{`Página ${pagina} de ${totalPaginas}`}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={deshabilitado || pagina >= totalPaginas}
        onClick={() => onCambiar(pagina + 1)}
      >
        Siguiente
      </Button>
    </nav>
  )
}
