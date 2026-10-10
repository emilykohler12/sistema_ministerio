import { zodResolver } from '@hookform/resolvers/zod'
import { Download, ExternalLink } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { type Resolver, useForm } from 'react-hook-form'
import { useEstablecimientos, useLocalidades } from '@/features/establecimientos/hooks/useEstablecimientos'
import { formatearTamanio } from '@/features/recursos/archivos'
import { ETIQUETA_TIPO_RECURSO } from '@/features/recursos/types'
import type { Taller } from '@/features/talleres/types'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { Dialog } from '@/shared/components/ui/Dialog'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Select } from '@/shared/components/ui/Select'
import { mensajeDeErrorDescarga } from '../errores'
import { esquemaDescarga } from '../esquema'
import { useDescargarTaller } from '../hooks/useDescargarTaller'
import { CARGOS, type Cargo, type DatosDescarga, type EnlaceDescarga, type TipoInstitucion } from '../types'
import { formularioRecordado, recordarFormulario, tallerRegistrado } from '../visita'

interface DescargaModalProps {
  taller: Pick<Taller, 'id' | 'nombre' | 'recurso'>
  open: boolean
  onClose: () => void
}

/**
 * Descarga de un taller (0006, 0010, 0022) en dos pasos: el formulario (cargo → localidad → institución), que registra la
 * descarga, y la lista de recursos con sus enlaces. Un taller ya registrado en la visita va directo a la lista.
 */
export function DescargaModal({ taller, open, onClose }: DescargaModalProps) {
  // El contenido vive en un hijo: se monta al abrir y arranca siempre desde cero (con el formulario recordado).
  return (
    <Dialog open={open} onClose={onClose} title="Descargar recursos" description={taller.nombre} className="max-w-lg">
      <Contenido taller={taller} />
    </Dialog>
  )
}

function Contenido({ taller }: { taller: DescargaModalProps['taller'] }) {
  const descarga = useDescargarTaller()
  const { mutate } = descarga
  const [yaRegistrado] = useState(() => tallerRegistrado(taller.id))
  const iniciado = useRef(false)

  // Un taller ya registrado en la visita no pide el formulario: se firman enlaces nuevos y se muestra la lista.
  useEffect(() => {
    if (yaRegistrado && !iniciado.current) {
      iniciado.current = true
      mutate({ taller })
    }
  }, [yaRegistrado, mutate, taller])

  if (descarga.isSuccess) return <ListaDescarga enlaces={descarga.data} />

  // Si el taller ya figura como registrado, lo que falló fue la firma: reintentar solo vuelve a firmar.
  if (yaRegistrado || tallerRegistrado(taller.id)) {
    if (descarga.isError) {
      return (
        <div className="space-y-4">
          <FieldError id="descarga-error" message={mensajeDeErrorDescarga(descarga.error)} />
          <div className="flex justify-end">
            <Button type="button" onClick={() => mutate({ taller })}>
              Reintentar
            </Button>
          </div>
        </div>
      )
    }
    return (
      <p role="status" className="py-6 text-center text-sm text-gray-500">
        Preparando tus archivos…
      </p>
    )
  }

  return (
    <Formulario
      pendiente={descarga.isPending}
      error={descarga.isError ? descarga.error : null}
      onEnviar={(datos) => mutate({ taller, datos })}
    />
  )
}

// El estado del formulario admite lo que todavía no se eligió; el esquema decide si se puede enviar.
type Valores = Omit<DatosDescarga, 'cargo' | 'localidad_id' | 'institucion_tipo'> & {
  cargo?: Cargo
  localidad_id?: number
  institucion_tipo?: TipoInstitucion
}

// Deja solo lo que corresponde a cada discriminador (la RPC igual lo anula; así se recuerda y se envía limpio).
function limpiar(datos: DatosDescarga): DatosDescarga {
  return {
    cargo: datos.cargo,
    cargo_otro: datos.cargo === 'Otro' ? datos.cargo_otro : null,
    localidad_id: datos.localidad_id,
    institucion_tipo: datos.institucion_tipo,
    establecimiento_id: datos.institucion_tipo === 'PADRON' ? datos.establecimiento_id : null,
    institucion_otra: datos.institucion_tipo === 'OTRA' ? datos.institucion_otra : null,
  }
}

function Formulario({
  pendiente,
  error,
  onEnviar,
}: {
  pendiente: boolean
  error: unknown
  onEnviar: (datos: DatosDescarga) => void
}) {
  const idCargo = useId()
  const idCargoOtro = useId()
  const idLocalidad = useId()
  const idInstitucion = useId()
  const idInstitucionOtra = useId()
  const [inicial] = useState(formularioRecordado)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<Valores>({
    resolver: zodResolver(esquemaDescarga) as unknown as Resolver<Valores>,
    defaultValues: inicial ?? {},
  })

  const cargo = watch('cargo')
  const localidadId = watch('localidad_id')
  const tipo = watch('institucion_tipo')
  const establecimientoId = watch('establecimiento_id')

  const localidades = useLocalidades()
  const establecimientos = useEstablecimientos(localidadId ?? null)
  // El admin también ve los inactivos por la RLS: elegirlos daría DA004.
  const activos = establecimientos.data?.filter((e) => e.activo)

  // Si el establecimiento elegido ya no está en la lista (se dio de baja: DA004 recarga la lista), se vacía la elección.
  useEffect(() => {
    if (activos && tipo === 'PADRON' && !activos.some((e) => e.id === establecimientoId)) {
      setValue('institucion_tipo', undefined)
      setValue('establecimiento_id', null)
    }
  }, [activos, tipo, establecimientoId, setValue])

  const validar = { shouldValidate: isSubmitted }

  function cambiarLocalidad(valor: string) {
    setValue('localidad_id', valor === '' ? undefined : Number(valor), validar)
    // Las instituciones son de una localidad: al cambiarla se vacía la elección.
    setValue('institucion_tipo', undefined)
    setValue('establecimiento_id', null)
    setValue('institucion_otra', null)
  }

  function cambiarInstitucion(valor: string) {
    if (valor === '') {
      setValue('institucion_tipo', undefined, validar)
      setValue('establecimiento_id', null)
    } else if (valor === 'OTRA' || valor === 'SIN_INSTITUCION') {
      setValue('institucion_tipo', valor, validar)
      setValue('establecimiento_id', null)
    } else {
      setValue('institucion_tipo', 'PADRON', validar)
      setValue('establecimiento_id', Number(valor), validar)
    }
  }

  const valorInstitucion = tipo === 'PADRON' ? String(establecimientoId ?? '') : (tipo ?? '')
  const errorInstitucion = errors.institucion_tipo?.message ?? errors.establecimiento_id?.message

  function enviar(valores: Valores) {
    const datos = limpiar(esquemaDescarga.parse(valores))
    recordarFormulario(datos)
    onEnviar(datos)
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="space-y-4">
      <p className="text-sm text-gray-600">
        Contanos quién descarga: así el Ministerio sabe a qué instituciones llegan los talleres.
      </p>

      <div>
        <Label htmlFor={idCargo}>Cargo</Label>
        <Select id={idCargo} error={!!errors.cargo} defaultValue="" {...register('cargo')}>
          <option value="">Elegí tu cargo</option>
          {CARGOS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <FieldError id={`${idCargo}-error`} message={errors.cargo?.message} />
      </div>

      {cargo === 'Otro' && (
        <div>
          <Label htmlFor={idCargoOtro}>Especificá tu cargo</Label>
          <Input id={idCargoOtro} error={!!errors.cargo_otro} {...register('cargo_otro')} />
          <FieldError id={`${idCargoOtro}-error`} message={errors.cargo_otro?.message} />
        </div>
      )}

      <div>
        <Label htmlFor={idLocalidad}>Localidad</Label>
        <Select
          id={idLocalidad}
          error={!!errors.localidad_id}
          value={localidadId === undefined ? '' : String(localidadId)}
          onChange={(e) => cambiarLocalidad(e.target.value)}
        >
          <option value="">Elegí tu localidad</option>
          {localidades.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </Select>
        <FieldError id={`${idLocalidad}-error`} message={errors.localidad_id?.message} />
        {localidades.isError && (
          <FieldError id={`${idLocalidad}-carga`} message="No pudimos cargar las localidades. Probá de nuevo más tarde." />
        )}
      </div>

      <div>
        <Label htmlFor={idInstitucion}>Institución</Label>
        <Select
          id={idInstitucion}
          error={!!errorInstitucion}
          disabled={localidadId === undefined}
          value={valorInstitucion}
          onChange={(e) => cambiarInstitucion(e.target.value)}
        >
          <option value="">
            {localidadId === undefined
              ? 'Primero elegí la localidad'
              : establecimientos.isPending
                ? 'Cargando instituciones…'
                : 'Elegí tu institución'}
          </option>
          {activos?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
          {localidadId !== undefined && !establecimientos.isPending && (
            <>
              <option value="OTRA">Otra</option>
              <option value="SIN_INSTITUCION">Sin institución</option>
            </>
          )}
        </Select>
        <FieldError id={`${idInstitucion}-error`} message={errorInstitucion} />
        {establecimientos.isError && (
          <FieldError
            id={`${idInstitucion}-carga`}
            message="No pudimos cargar las instituciones de la localidad. Podés elegir Otra o Sin institución."
          />
        )}
      </div>

      {tipo === 'OTRA' && (
        <div>
          <Label htmlFor={idInstitucionOtra}>Nombre de la institución</Label>
          <Input id={idInstitucionOtra} error={!!errors.institucion_otra} {...register('institucion_otra')} />
          <FieldError id={`${idInstitucionOtra}-error`} message={errors.institucion_otra?.message} />
        </div>
      )}

      {error !== null && <FieldError id="descarga-error" message={mensajeDeErrorDescarga(error)} />}

      <div className="flex justify-end">
        <Button type="submit" disabled={pendiente}>
          <Download className="h-4 w-4" aria-hidden="true" /> Descargar
        </Button>
      </div>
    </form>
  )
}

function ListaDescarga({ enlaces }: { enlaces: EnlaceDescarga[] }) {
  const total = enlaces.reduce((suma, { recurso }) => suma + (recurso.tamanio_bytes ?? 0), 0)
  const hayArchivos = enlaces.some(({ recurso }) => recurso.tamanio_bytes !== null)

  return (
    <div>
      <ul className="space-y-3">
        {enlaces.map(({ recurso, url }) => {
          const externo = recurso.ruta_archivo === null
          return (
            <li
              key={recurso.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3"
            >
              <a
                href={url}
                {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="inline-flex items-center gap-2 font-medium text-primary-600 hover:underline"
              >
                {recurso.nombre}
                {externo ? (
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </a>
              <div className="flex shrink-0 items-center gap-3 text-sm text-gray-500">
                <Badge variant="neutral">{ETIQUETA_TIPO_RECURSO[recurso.tipo]}</Badge>
                {recurso.tamanio_bytes !== null && <span>{formatearTamanio(recurso.tamanio_bytes)}</span>}
              </div>
            </li>
          )
        })}
      </ul>
      {hayArchivos && <p className="mt-3 text-sm text-gray-500">Tamaño total: {formatearTamanio(total)}</p>}
    </div>
  )
}
