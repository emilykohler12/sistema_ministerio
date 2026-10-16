/** Barra CSS decorativa: el valor ya está en texto en otra celda. */
export function Barra({ valor, maximo }: { valor: number; maximo: number }) {
  const ancho = maximo > 0 ? (valor / maximo) * 100 : 0
  return (
    <div aria-hidden="true" className="h-2.5 w-full rounded-full bg-gray-100">
      <div className="h-2.5 rounded-full bg-primary-700" style={{ width: `${ancho}%` }} />
    </div>
  )
}
