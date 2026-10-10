import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ETIQUETA_ESTADO, NIVELES, nombreNivel, type EstadoTaller } from '@/features/talleres/types'
import { mensajeDeError } from '@/features/talleres/errores'
import { filtrarTalleres } from '@/features/talleres/filtrar'
import { useCategoriaDeRuta } from '@/features/talleres/hooks/useCategoriaDeRuta'
import { useCambiarEstadoTaller, useTalleres } from '@/features/talleres/hooks/useTalleres'
import { Buscador } from '@/shared/components/ui/Buscador'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { TableSkeleton } from '@/shared/components/ui/Skeleton'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog'
import { formatFechaDeTimestamp } from '@/shared/lib/date'
import { NoEncontrado } from '@/shared/components/ui/NoEncontrado'
import { idDeRuta } from '@/shared/lib/rutas'

const VARIANTE_ESTADO = { BORRADOR: 'neutral', PUBLICADO: 'success', INACTIVO: 'warning' } as const satisfies Record<
  EstadoTaller,
  'neutral' | 'success' | 'warning'
>

const MENSAJE_GENERICO = 'No pudimos actualizar el taller. Probá de nuevo.'

export function TalleresListPage() {
  const params = useParams<{ nivelId: string; categoriaId: string }>()
  const [busqueda, setBusqueda] = useState('')
  const [tallerADarDeBaja, setTallerADarDeBaja] = useState<number | null>(null)

  const nivelInfo = NIVELES.find((n) => n.id === idDeRuta(params.nivelId))
  const nivel = nivelInfo?.id
  const categoriaRuta = useCategoriaDeRuta(params.nivelId, params.categoriaId)
  const categoriaId = idDeRuta(params.categoriaId) ?? undefined
  const talleres = useTalleres(categoriaId)
  const cambiarEstado = useCambiarEstadoTaller()

  if (!nivelInfo) return <NoEncontrado titulo="Nivel no encontrado" volverA="/admin/talleres" />
  if (categoriaRuta.estado === 'cargando') return <TableSkeleton />
  if (categoriaRuta.estado === 'error') return <ErrorFallback onRetry={categoriaRuta.reintentar} />
  if (categoriaRuta.estado === 'no-encontrada') {
    return <NoEncontrado titulo="Categoría no encontrada" volverA={`/admin/talleres/${nivel}`} />
  }
  const categoria = categoriaRuta.categoria
  const visibles = filtrarTalleres(talleres.data ?? [], { busqueda })

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Talleres', to: '/admin/talleres' },
          { label: nivelInfo.nombre, to: `/admin/talleres/${nivel}` },
          { label: categoria.nombre },
        ]}
      />

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-primary-800">{categoria.nombre}</h1>
          <Badge variant="primary" className="mt-2">
            Nivel {nombreNivel(categoria.nivel_id).toLowerCase()}
          </Badge>
        </div>
        <Link to={`/admin/talleres/${nivel}/${categoriaId}/nuevo`}>
          <Button>+ Nuevo taller</Button>
        </Link>
      </div>

      <div className="mt-6">
        <Buscador value={busqueda} onChange={setBusqueda} etiqueta="Buscar por nombre o etiqueta" placeholder="Buscar por nombre o etiqueta..." />
      </div>

      <div className="mt-4">
        {cambiarEstado.isError && (
          <div className="mb-4">
            <ErrorFallback message={mensajeDeError(cambiarEstado.error, MENSAJE_GENERICO)} />
          </div>
        )}
        {talleres.isLoading && <TableSkeleton />}
        {talleres.isError && <ErrorFallback onRetry={() => talleres.refetch()} />}
        {talleres.isSuccess && visibles.length === 0 && (
          <EmptyState
            title="Todavía no hay talleres en esta categoría"
            action={
              <Link to={`/admin/talleres/${nivel}/${categoriaId}/nuevo`}>
                <Button size="sm">+ Nuevo taller</Button>
              </Link>
            }
          />
        )}
        {talleres.isSuccess && visibles.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-gray-100 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Destinatarios</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Recursos</th>
                  <th className="px-4 py-3 font-medium">Última modificación</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-medium text-gray-800">{t.nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{t.destinatario.map((d) => d.nombre).join(', ')}</td>
                    <td className="px-4 py-3">
                      <Badge variant={VARIANTE_ESTADO[t.estado]}>{ETIQUETA_ESTADO[t.estado]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.recurso.length}</td>
                    <td className="px-4 py-3 text-gray-600">{formatFechaDeTimestamp(t.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 font-medium">
                        <Link
                          to={`/admin/talleres/${nivel}/${categoriaId}/${t.id}/editar`}
                          className="text-primary-600 hover:underline"
                        >
                          Editar
                        </Link>
                        <Link
                          to={`/admin/talleres/${nivel}/${categoriaId}/${t.id}/recursos`}
                          className="text-primary-600 hover:underline"
                        >
                          Recursos
                        </Link>
                        {t.estado === 'INACTIVO' ? (
                          <button
                            type="button"
                            disabled={cambiarEstado.isPending}
                            onClick={() => cambiarEstado.mutate({ id: t.id, estado: 'BORRADOR' })}
                            className="text-primary-600 hover:underline disabled:opacity-50"
                          >
                            Reactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={cambiarEstado.isPending}
                            onClick={() => setTallerADarDeBaja(t.id)}
                            className="text-red-600 hover:underline disabled:opacity-50"
                          >
                            Dar de baja
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={tallerADarDeBaja !== null}
        onClose={() => setTallerADarDeBaja(null)}
        onConfirm={() => {
          if (tallerADarDeBaja !== null) cambiarEstado.mutate({ id: tallerADarDeBaja, estado: 'INACTIVO' })
        }}
        title="Dar de baja el taller"
        description="El taller deja de verse en el portal. No se elimina: podés reactivarlo cuando quieras."
        confirmLabel="Dar de baja"
      />
    </div>
  )
}
