import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiltrosHistorial } from '@/features/historial/components/FiltrosHistorial'
import { TablaHistorial } from '@/features/historial/components/TablaHistorial'
import {
  FILTROS_VACIOS,
  TAMANIO_PAGINA,
  filtrosAUrl,
  filtrosDesdeUrl,
  hayFiltros,
  validarFiltros,
  type FiltrosHistorial as Filtros,
} from '@/features/historial/filtros'
import { useHistorial } from '@/features/historial/hooks/useHistorial'
import { useUsuariosHistorial } from '@/features/historial/hooks/useUsuariosHistorial'
import { Button } from '@/shared/components/ui/Button'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { Paginacion } from '@/shared/components/ui/Paginacion'
import { Skeleton } from '@/shared/components/ui/Skeleton'
import { cn } from '@/shared/lib/utils'

function CargandoHistorial() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  )
}

function textoTotal(total: number) {
  return `${total.toLocaleString('es-AR')} ${total === 1 ? 'operación' : 'operaciones'}`
}

export function HistorialPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const clave = searchParams.toString()
  const filtros = filtrosDesdeUrl(searchParams)
  const errorFiltros = validarFiltros(filtros)
  const { data, isError, isPending, isPlaceholderData, refetch } = useHistorial(filtros)
  const usuarios = useUsuariosHistorial()

  // La fila expandida vale solo para la vista (filtros y página) en la que se abrió: al cambiar la URL se colapsa,
  // también con atrás/adelante.
  const [abierta, setAbierta] = useState<{ clave: string; id: number } | null>(null)
  const expandida = abierta?.clave === clave ? abierta.id : null

  const emails = useMemo(() => new Map((usuarios.data ?? []).map((u) => [u.id, u.email])), [usuarios.data])

  // Tras cambiar de página, el foco va al total cuando llegan los datos (el botón queda abajo de 50 filas).
  const total = useRef<HTMLParagraphElement>(null)
  const moverFoco = useRef(false)
  useEffect(() => {
    if (!moverFoco.current || isPlaceholderData || !data) return
    moverFoco.current = false
    total.current?.focus()
  }, [data, isPlaceholderData])

  const aplicar = (siguiente: Filtros) => setSearchParams(filtrosAUrl(siguiente))
  const cambiarFiltros = (cambios: Partial<Filtros>) => {
    moverFoco.current = false
    aplicar({ ...filtros, ...cambios, pagina: 1 })
  }
  // Las fechas reemplazan la entrada del historial del navegador: "Atrás" vuelve a la vista anterior, no a una fecha intermedia.
  const cambiarFechas = useCallback(
    (desde: string | null, hasta: string | null) => {
      moverFoco.current = false
      setSearchParams((previos) => filtrosAUrl({ ...filtrosDesdeUrl(previos), desde, hasta, pagina: 1 }), {
        replace: true,
      })
    },
    [setSearchParams],
  )
  const cambiarPagina = (pagina: number) => {
    moverFoco.current = true
    aplicar({ ...filtros, pagina })
  }
  const limpiar = () => {
    moverFoco.current = false
    aplicar(FILTROS_VACIOS)
  }
  const alternar = (id: number) => setAbierta(expandida === id ? null : { clave, id })

  return (
    <div>
      <div className="mb-6 space-y-4">
        <h1 className="text-2xl font-bold text-primary-800">Historial</h1>
        <FiltrosHistorial
          filtros={filtros}
          error={errorFiltros}
          emails={emails}
          errorUsuarios={usuarios.isError}
          onCambiar={cambiarFiltros}
          onFechas={cambiarFechas}
        />
      </div>

      {errorFiltros === null && isError && <ErrorFallback onRetry={() => refetch()} />}
      {errorFiltros === null && !isError && isPending && <CargandoHistorial />}
      {errorFiltros === null && !isError && data && data.filas.length === 0 && (
        <EmptyState
          title="Sin operaciones"
          description={filtros.pagina > 1 ? 'Esa página no existe.' : 'No hay operaciones para los filtros elegidos.'}
          action={
            (hayFiltros(filtros) || filtros.pagina > 1) && (
              <Button variant="outline" size="sm" onClick={limpiar}>
                Limpiar filtros
              </Button>
            )
          }
        />
      )}
      {errorFiltros === null && !isError && data && data.filas.length > 0 && (
        <div aria-busy={isPlaceholderData} className={cn('space-y-3', isPlaceholderData && 'opacity-60')}>
          <p ref={total} tabIndex={-1} className="text-sm text-gray-600 focus-visible:outline-none">
            {textoTotal(data.total ?? data.filas.length)}
          </p>
          <TablaHistorial operaciones={data.filas} emails={emails} expandida={expandida} onAlternar={alternar} />
          <Paginacion
            pagina={filtros.pagina}
            totalPaginas={Math.max(1, Math.ceil((data.total ?? data.filas.length) / TAMANIO_PAGINA))}
            onCambiar={cambiarPagina}
          />
        </div>
      )}
    </div>
  )
}
