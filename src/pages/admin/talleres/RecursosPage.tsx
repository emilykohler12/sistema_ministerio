import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatearTamanio, validarArchivo } from '@/features/recursos/archivos'
import { DialogoRecurso } from '@/features/recursos/components/DialogoRecurso'
import { mensajeDeErrorRecurso } from '@/features/recursos/errores'
import {
  useActualizarRecurso,
  useAltaArchivos,
  useCrearEnlace,
  useEliminarRecurso,
  useOrdenarRecursos,
  useReemplazarArchivo,
  useVerArchivo,
} from '@/features/recursos/hooks/useRecursos'
import { ETIQUETA_TIPO_RECURSO, type Recurso } from '@/features/recursos/types'
import { useCategoriaDeRuta } from '@/features/talleres/hooks/useCategoriaDeRuta'
import { useTaller } from '@/features/talleres/hooks/useTalleres'
import { NIVELES, type Taller } from '@/features/talleres/types'
import { Badge } from '@/shared/components/ui/Badge'
import { Breadcrumb } from '@/shared/components/ui/Breadcrumb'
import { Button } from '@/shared/components/ui/Button'
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog'
import { EmptyState } from '@/shared/components/ui/EmptyState'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { FileDropzone } from '@/shared/components/ui/FileDropzone'
import { CardSkeleton } from '@/shared/components/ui/Skeleton'
import { NoEncontrado } from '@/shared/components/ui/NoEncontrado'
import { idDeRuta } from '@/shared/lib/rutas'

const FORMATOS_ACEPTADOS = '.pdf,.pptx,.docx,.jpg,.jpeg,.png,.webp,.mp4'

export function RecursosPage() {
  const params = useParams<{ nivelId: string; categoriaId: string; tallerId: string }>()
  const nivel = NIVELES.find((n) => n.id === idDeRuta(params.nivelId))
  const categoriaRuta = useCategoriaDeRuta(params.nivelId, params.categoriaId)
  const tallerId = idDeRuta(params.tallerId)
  const tallerRuta = useTaller(tallerId)

  if (!nivel) return <NoEncontrado titulo="Nivel no encontrado" volverA="/admin/talleres" />
  if (categoriaRuta.estado === 'cargando') return <CardSkeleton />
  if (categoriaRuta.estado === 'error') return <ErrorFallback onRetry={categoriaRuta.reintentar} />
  if (categoriaRuta.estado === 'no-encontrada') {
    return <NoEncontrado titulo="Categoría no encontrada" volverA={`/admin/talleres/${nivel.id}`} />
  }
  const categoria = categoriaRuta.categoria

  const volverA = `/admin/talleres/${nivel.id}/${categoria.id}`
  if (tallerId === null) return <NoEncontrado titulo="Taller no encontrado" volverA={volverA} />
  if (tallerRuta.isError) return <ErrorFallback onRetry={() => void tallerRuta.refetch()} />
  if (tallerRuta.data === undefined) return <CardSkeleton />
  if (tallerRuta.data === null || tallerRuta.data.categoria_id !== categoria.id) {
    return <NoEncontrado titulo="Taller no encontrado" volverA={volverA} />
  }

  return (
    <Pantalla
      taller={tallerRuta.data}
      migas={[
        { label: 'Talleres', to: '/admin/talleres' },
        { label: nivel.nombre, to: `/admin/talleres/${nivel.id}` },
        { label: categoria.nombre, to: volverA },
        { label: tallerRuta.data.nombre },
      ]}
    />
  )
}

type Edicion = { tipo: 'enlace-nuevo' } | { tipo: 'editar'; recurso: Recurso }

function Pantalla({ taller, migas }: { taller: Taller; migas: { label: string; to?: string }[] }) {
  const recursos = taller.recurso
  const alta = useAltaArchivos()
  const crearEnlace = useCrearEnlace()
  const actualizar = useActualizarRecurso()
  const reemplazar = useReemplazarArchivo()
  const eliminar = useEliminarRecurso()
  const ordenar = useOrdenarRecursos()
  const verArchivo = useVerArchivo()

  const [rechazados, setRechazados] = useState<string[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [dialogo, setDialogo] = useState<Edicion | null>(null)
  const [aEliminar, setAEliminar] = useState<Recurso | null>(null)

  // Durante un lote la caché está vieja hasta que termina: reordenar o agregar un enlace fallaría o repetiría un `orden`.
  const ocupado = alta.enCurso || ordenar.isPending || eliminar.isPending || reemplazar.isPending
  const erroresDeSubida = [
    ...rechazados,
    ...alta.estados
      .filter((e) => e.estado === 'error')
      .map((e) => `${e.archivo.name}: ${e.motivo ?? ''}`),
  ]
  const enProceso = alta.estados.filter((e) => e.estado === 'esperando' || e.estado === 'subiendo')

  function avisar(error: unknown) {
    setAvisos([mensajeDeErrorRecurso(error)])
  }

  function elegirArchivos(files: File[]) {
    if (alta.enCurso) {
      setAvisos(['Esperá a que termine la subida en curso antes de elegir más archivos.'])
      return
    }
    setAvisos([])
    const validos: File[] = []
    const motivos: string[] = []
    for (const file of files) {
      const motivo = validarArchivo(file)
      if (motivo) motivos.push(`${file.name}: ${motivo}`)
      else validos.push(file)
    }
    setRechazados(motivos)
    void alta.subir(taller.id, validos, recursos)
  }

  function mover(indice: number, delta: -1 | 1) {
    const ids = recursos.map((r) => r.id)
    ;[ids[indice], ids[indice + delta]] = [ids[indice + delta], ids[indice]]
    setAvisos([])
    ordenar.mutate({ tallerId: taller.id, ids }, { onError: avisar })
  }

  function ver(recurso: Recurso) {
    if (recurso.ruta_archivo === null) return
    setAvisos([])
    verArchivo.mutate(recurso.ruta_archivo, { onError: avisar })
  }

  function reemplazarArchivo(recurso: Recurso, file: File) {
    setAvisos([])
    const motivo = validarArchivo(file)
    if (motivo) {
      setAvisos([`${file.name}: ${motivo}`])
      return
    }
    reemplazar.mutate({ recurso, file }, { onError: avisar })
  }

  return (
    <div>
      <Breadcrumb items={migas} />

      <h1 className="text-2xl font-bold text-primary-800">Recursos</h1>
      <p className="mt-1 text-gray-600">{taller.nombre}</p>

      <div className="mt-6 space-y-3">
        <FileDropzone
          multiple
          accept={FORMATOS_ACEPTADOS}
          label="Arrastrá los archivos o"
          hint="PDF, PPTX, DOCX, imagen (JPG, PNG, WebP) o MP4, hasta 50 MB cada uno"
          onFiles={elegirArchivos}
        />
        {enProceso.length > 0 && (
          <ul className="text-sm text-gray-600" aria-live="polite">
            {enProceso.map((e) => (
              <li key={`${e.archivo.name}-${e.archivo.lastModified}-${e.archivo.size}`}>
                {e.archivo.name}: {e.estado === 'subiendo' ? 'Subiendo…' : 'En espera'}
              </li>
            ))}
          </ul>
        )}
        {erroresDeSubida.length > 0 && <Alerta lineas={erroresDeSubida} />}
        <Button variant="outline" disabled={ocupado} onClick={() => setDialogo({ tipo: 'enlace-nuevo' })}>
          Agregar enlace
        </Button>
      </div>

      <div className="mt-6">
        {avisos.length > 0 && <Alerta lineas={avisos} />}
        {recursos.length === 0 ? (
          <EmptyState title="Todavía no hay recursos en este taller" />
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {recursos.map((r, i) => (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Badge variant="neutral">{ETIQUETA_TIPO_RECURSO[r.tipo]}</Badge>
                  <span className="truncate font-medium text-gray-800">{r.nombre}</span>
                  {r.tamanio_bytes !== null && (
                    <span className="text-sm text-gray-500">{formatearTamanio(r.tamanio_bytes)}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Subir ${r.nombre}`}
                    disabled={i === 0 || ocupado}
                    onClick={() => mover(i, -1)}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    Subir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Bajar ${r.nombre}`}
                    disabled={i === recursos.length - 1 || ocupado}
                    onClick={() => mover(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    Bajar
                  </Button>
                  {r.ruta_archivo !== null && (
                    <>
                      <Button size="sm" variant="ghost" aria-label={`Ver ${r.nombre}`} onClick={() => ver(r)}>
                        Ver
                      </Button>
                      <BotonReemplazar
                        recurso={r}
                        disabled={ocupado}
                        onElegido={(file) => reemplazarArchivo(r, file)}
                      />
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Editar ${r.nombre}`}
                    onClick={() => setDialogo({ tipo: 'editar', recurso: r })}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    aria-label={`Eliminar ${r.nombre}`}
                    disabled={ocupado}
                    onClick={() => setAEliminar(r)}
                  >
                    Eliminar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogoRecurso
        open={dialogo?.tipo === 'enlace-nuevo'}
        onClose={() => setDialogo(null)}
        titulo="Agregar enlace"
        accion="Agregar"
        conUrl
        mensajeDeError={mensajeDeErrorRecurso}
        onSubmit={async ({ nombre, url }) => {
          await crearEnlace.mutateAsync({ tallerId: taller.id, nombre, url, recursos })
        }}
      />
      {dialogo?.tipo === 'editar' && (
        <DialogoRecurso
          open
          onClose={() => setDialogo(null)}
          titulo="Editar recurso"
          accion="Guardar"
          conUrl={dialogo.recurso.tipo === 'ENLACE'}
          inicial={{ nombre: dialogo.recurso.nombre, url: dialogo.recurso.url ?? '' }}
          mensajeDeError={mensajeDeErrorRecurso}
          onSubmit={async ({ nombre, url }) => {
            const { recurso } = dialogo
            await actualizar.mutateAsync({
              id: recurso.id,
              cambios: recurso.tipo === 'ENLACE' ? { nombre, url } : { nombre },
            })
          }}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={() => {
          if (aEliminar === null) return
          setAvisos([])
          eliminar.mutate(aEliminar, { onError: avisar })
        }}
        title="Eliminar el recurso"
        description="Se elimina para siempre, junto con su archivo. Esta acción no se puede deshacer."
      />
    </div>
  )
}

function Alerta({ lineas }: { lineas: string[] }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {lineas.map((linea, i) => (
        // La lista no se reordena y dos líneas pueden coincidir (mismo archivo y mismo motivo): el texto no sirve de key.
        <p key={i}>{linea}</p>
      ))}
    </div>
  )
}

/** Botón "Reemplazar": abre el selector de un único archivo y entrega el elegido. */
function BotonReemplazar({
  recurso,
  disabled,
  onElegido,
}: {
  recurso: Recurso
  disabled: boolean
  onElegido: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Reemplazar ${recurso.nombre}`}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Reemplazar
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={FORMATOS_ACEPTADOS}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Archivo nuevo para ${recurso.nombre}`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onElegido(file)
        }}
      />
    </>
  )
}
