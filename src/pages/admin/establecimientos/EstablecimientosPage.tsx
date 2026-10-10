import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { filtrarEstablecimientos } from '@/features/establecimientos/filtrar'
import {
  useActualizarEstablecimiento,
  useEstablecimientos,
  useLocalidades,
} from '@/features/establecimientos/hooks/useEstablecimientos'
import type { Establecimiento } from '@/features/establecimientos/types'
import { Badge } from '@/shared/components/ui/Badge'
import { Buscador } from '@/shared/components/ui/Buscador'
import { Button } from '@/shared/components/ui/Button'
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { Label } from '@/shared/components/ui/Label'
import { Select } from '@/shared/components/ui/Select'
import { TableSkeleton } from '@/shared/components/ui/Skeleton'
import { idDeRuta } from '@/shared/lib/rutas'

export function EstablecimientosPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [busqueda, setBusqueda] = useState('')
  const [aDarDeBaja, setADarDeBaja] = useState<Establecimiento | null>(null)
  const localidades = useLocalidades()
  const actualizar = useActualizarEstablecimiento()

  // Solo se consulta con una localidad que está en la lista cargada; cualquier otro valor se trata como sin localidad.
  const idParam = idDeRuta(searchParams.get('localidad'))
  const localidadId =
    idParam !== null && localidades.isSuccess && localidades.data.some((l) => l.id === idParam) ? idParam : null
  // Mientras cargan las localidades (o si fallan) no se pide elegir: el id de la URL todavía no se puede validar.
  const validando = idParam !== null && !localidades.isSuccess && !localidades.isError
  const establecimientos = useEstablecimientos(localidadId)

  function elegirLocalidad(valor: string) {
    setBusqueda('')
    setSearchParams(valor === '' ? {} : { localidad: valor })
  }

  const rutaNuevo =
    localidadId === null ? '/admin/establecimientos/nuevo' : `/admin/establecimientos/nuevo?localidad=${localidadId}`
  const visibles = establecimientos.isSuccess ? filtrarEstablecimientos(establecimientos.data, busqueda) : []

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary-800">Establecimientos</h1>
        <Link to={rutaNuevo}>
          <Button>Nuevo establecimiento</Button>
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Label htmlFor="localidad">Localidad</Label>
          <Select id="localidad" value={localidadId === null ? '' : String(localidadId)} onChange={(e) => elegirLocalidad(e.target.value)}>
            <option value="">Elegí una localidad</option>
            {localidades.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </Select>
        </div>
        {localidadId !== null && (
          <Buscador
            value={busqueda}
            onChange={setBusqueda}
            etiqueta="Buscar por nombre o CUE"
            placeholder="Buscar por nombre o CUE..."
          />
        )}
      </div>

      <div className="mt-4">
        {localidades.isError && <ErrorFallback onRetry={() => void localidades.refetch()} />}
        {actualizar.isError && (
          <div className="mb-4">
            <ErrorFallback message="No pudimos actualizar el establecimiento. Probá de nuevo." />
          </div>
        )}
        {validando && <TableSkeleton />}
        {localidadId === null && !validando && !localidades.isError && (
          <EmptyState title="Elegí una localidad para ver sus establecimientos" />
        )}
        {localidadId !== null && establecimientos.isPending && <TableSkeleton />}
        {localidadId !== null && establecimientos.isError && (
          <ErrorFallback onRetry={() => void establecimientos.refetch()} />
        )}
        {establecimientos.isSuccess && establecimientos.data.length === 0 && (
          <EmptyState
            title="Esta localidad todavía no tiene establecimientos"
            action={
              <Link to={rutaNuevo}>
                <Button size="sm">Nuevo establecimiento</Button>
              </Link>
            }
          />
        )}
        {establecimientos.isSuccess && establecimientos.data.length > 0 && visibles.length === 0 && (
          <EmptyState title="Ningún establecimiento coincide con la búsqueda" />
        )}
        {visibles.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-gray-100 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">CUE</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {e.nombre}
                      {!e.activo && (
                        <Badge variant="neutral" className="ml-2">
                          Inactivo
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.cue}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 font-medium">
                        <Link to={`/admin/establecimientos/${e.id}/editar`} className="text-primary-600 hover:underline">
                          Editar
                        </Link>
                        {e.activo ? (
                          <button
                            type="button"
                            onClick={() => setADarDeBaja(e)}
                            className="text-red-600 hover:underline"
                          >
                            Dar de baja
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={actualizar.isPending}
                            onClick={() => actualizar.mutate({ id: e.id, cambios: { activo: true } })}
                            className="text-primary-600 hover:underline disabled:opacity-50"
                          >
                            Reactivar
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
        open={aDarDeBaja !== null}
        onClose={() => setADarDeBaja(null)}
        onConfirm={() => {
          if (aDarDeBaja) actualizar.mutate({ id: aDarDeBaja.id, cambios: { activo: false } })
        }}
        title="Dar de baja el establecimiento"
        description="Deja de verse para las instituciones y podés reactivarlo cuando quieras."
        confirmLabel="Dar de baja"
      />
    </div>
  )
}
