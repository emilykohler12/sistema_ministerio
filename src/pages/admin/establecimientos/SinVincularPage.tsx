import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSinVincular } from '@/features/establecimientos/hooks/useSinVincular'
import type { Establecimiento, GrupoSinVincular } from '@/features/establecimientos/types'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { Label } from '@/shared/components/ui/Label'
import { Select } from '@/shared/components/ui/Select'
import { TableSkeleton } from '@/shared/components/ui/Skeleton'
import { formatFechaDeTimestamp } from '@/shared/lib/date'
import { DialogoCrear } from './DialogoCrear'
import { DialogoVincular } from './DialogoVincular'

type Dialogo = { tipo: 'vincular' | 'crear'; grupo: GrupoSinVincular } | null

function descargasTexto(cantidad: number) {
  return cantidad === 1 ? '1 descarga' : `${cantidad} descargas`
}

/** Instituciones "Otra" sin establecimiento, agrupadas por localidad y nombre, para asignarlas al padrón. */
export function SinVincularPage() {
  const grupos = useSinVincular()
  const [localidad, setLocalidad] = useState('')
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  // Cada vez que cambia, el foco vuelve al encabezado (el disparador pudo desaparecer con su fila).
  const [devolverFoco, setDevolverFoco] = useState(0)
  const titulo = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (devolverFoco > 0) titulo.current?.focus()
  }, [devolverFoco])

  // Las opciones salen de los grupos cargados: no hace falta pedir las 79 localidades.
  const localidades = new Map<number, string>()
  for (const g of grupos.data ?? []) localidades.set(g.localidad_id, g.localidad)
  const opciones = [...localidades].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  // Si el filtro elegido ya no tiene grupos (por ejemplo, se vinculó el último), vuelve a "Todas".
  const filtro = localidades.has(Number(localidad)) ? localidad : ''
  const visibles = (grupos.data ?? []).filter((g) => filtro === '' || String(g.localidad_id) === filtro)

  function abrir(tipo: 'vincular' | 'crear', grupo: GrupoSinVincular) {
    setResultado(null)
    setDialogo({ tipo, grupo })
  }

  function terminar(cantidad: number, establecimiento: Establecimiento, creado: boolean) {
    setDialogo(null)
    setDevolverFoco((n) => n + 1)
    if (cantidad === 0) {
      setResultado('Ya estaba vinculado')
      return
    }
    const descargas = descargasTexto(cantidad)
    setResultado(
      creado
        ? `Se creó «${establecimiento.nombre}» y se vinculó con ${descargas}.`
        : `Se vinculó con «${establecimiento.nombre}» (${descargas}).`,
    )
  }

  return (
    <div>
      <Breadcrumb
        items={[{ label: 'Establecimientos', to: '/admin/establecimientos' }, { label: 'Instituciones sin vincular' }]}
      />
      <h1 ref={titulo} tabIndex={-1} className="text-2xl font-bold text-primary-800 focus:outline-none">
        Instituciones sin vincular
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Nombres que las instituciones escribieron al descargar con «Otra». Asignalos a un establecimiento del padrón
        para que cuenten como alcanzados; lo que escribieron se conserva.{' '}
        <Link to="/admin/establecimientos" className="text-primary-600 hover:underline">
          Ver el padrón
        </Link>
      </p>

      {/* Siempre montado: una región viva que entra al DOM ya con el texto no se anuncia de forma confiable. */}
      <p
        role="status"
        className={
          resultado ? 'mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800' : 'sr-only'
        }
      >
        {resultado}
      </p>

      {grupos.isSuccess && grupos.data.length > 0 && (
        <div className="mt-6 sm:w-72">
          <Label htmlFor="filtro-localidad">Localidad</Label>
          <Select id="filtro-localidad" value={filtro} onChange={(e) => setLocalidad(e.target.value)}>
            <option value="">Todas las localidades</option>
            {opciones.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="mt-4">
        {grupos.isPending && <TableSkeleton />}
        {grupos.isError && <ErrorFallback onRetry={() => void grupos.refetch()} />}
        {grupos.isSuccess && grupos.data.length === 0 && <EmptyState title="No hay instituciones sin vincular" />}
        {visibles.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-gray-100 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Localidad</th>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Otras formas escritas</th>
                  <th className="px-4 py-3 font-medium">Descargas</th>
                  <th className="px-4 py-3 font-medium">Última descarga</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((g) => (
                  <tr key={`${g.localidad_id}-${g.nombre}`}>
                    <td className="px-4 py-3 text-gray-600">{g.localidad}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{g.nombre}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {g.variantes.length > 0 && (
                        <>
                          <span className="text-gray-500">También: </span>
                          {g.variantes.map((v, i) => (
                            <span key={v}>
                              {i > 0 && ', '}
                              <span>{v}</span>
                            </span>
                          ))}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{g.descargas}</td>
                    <td className="px-4 py-3 text-gray-600">{formatFechaDeTimestamp(g.ultima)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 font-medium">
                        <button
                          type="button"
                          onClick={() => abrir('vincular', g)}
                          className="text-primary-600 hover:underline"
                        >
                          Vincular
                        </button>
                        <button
                          type="button"
                          onClick={() => abrir('crear', g)}
                          className="text-primary-600 hover:underline"
                        >
                          Crear establecimiento
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogo?.tipo === 'vincular' && (
        <DialogoVincular
          grupo={dialogo.grupo}
          onClose={() => setDialogo(null)}
          onVinculado={(cantidad, est) => terminar(cantidad, est, false)}
        />
      )}
      {dialogo?.tipo === 'crear' && (
        <DialogoCrear
          grupo={dialogo.grupo}
          onClose={() => setDialogo(null)}
          onVinculado={(cantidad, est) => terminar(cantidad, est, true)}
        />
      )}
    </div>
  )
}
