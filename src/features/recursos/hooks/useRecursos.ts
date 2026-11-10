import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { CLAVE_TALLERES } from '@/features/talleres/hooks/useTalleres'
import { esCancelacion } from '@/shared/lib/erroresStorage'
import { actualizarRecurso, insertarRecurso, ordenarRecursos, urlFirmada } from '../consultas'
import { mensajeDeErrorRecurso } from '../errores'
import { altaArchivo, eliminarRecurso, reemplazarArchivo } from '../secuencias'
import type { CambiosRecurso, Recurso } from '../types'

// Los recursos viajan embebidos en los talleres (clave única `['talleres']`): toda mutación la invalida.
function useInvalidarTalleres() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: CLAVE_TALLERES })
}

const ordenSiguiente = (recursos: Recurso[]) => recursos.reduce((max, r) => Math.max(max, r.orden), 0) + 1

export function useCrearEnlace() {
  const invalidar = useInvalidarTalleres()
  return useMutation({
    mutationFn: ({
      tallerId,
      nombre,
      url,
      recursos,
    }: {
      tallerId: number
      nombre: string
      url: string
      recursos: Recurso[]
    }) => insertarRecurso({ taller_id: tallerId, nombre, tipo: 'ENLACE', url, orden: ordenSiguiente(recursos) }),
    onSuccess: invalidar,
  })
}

export function useActualizarRecurso() {
  const invalidar = useInvalidarTalleres()
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: CambiosRecurso }) => actualizarRecurso(id, cambios),
    // También al fallar: con la caché vieja (otra pestaña) el error es PGRST116 y la lista debe recargarse.
    onSettled: invalidar,
  })
}

/** Estados de un archivo que todavía no terminó: los que muestran barra de progreso. */
export type EstadoEnCurso = 'esperando' | 'subiendo' | 'reintentando' | 'finalizando'

type SubidaEnCurso = { progreso: number; estado: Exclude<EstadoEnCurso, 'esperando'> }

/** Con todos los bytes enviados solo falta que el servidor cierre el objeto: ya no se puede cancelar. */
const estadoSegunProgreso = (progreso: number): SubidaEnCurso['estado'] =>
  progreso >= 100 ? 'finalizando' : 'subiendo'

/**
 * Reemplazo de un archivo con progreso y cancelación. `cancelar()` aborta la subida (la mutación falla con un
 * `AbortError`, que no es un error: la fila queda con su archivo anterior) y al desmontar se aborta sola.
 */
export function useReemplazarArchivo() {
  const invalidar = useInvalidarTalleres()
  const [subida, setSubida] = useState<SubidaEnCurso | null>(null)
  const control = useRef<AbortController | null>(null)

  useEffect(() => () => control.current?.abort(), [])

  const mutacion = useMutation({
    mutationFn: ({ recurso, file }: { recurso: Recurso; file: File }) => {
      const propio = new AbortController()
      control.current = propio
      // Un evento tardío de una subida que ya terminó no debe reabrir el estado.
      const vigente = () => control.current === propio
      setSubida({ progreso: 0, estado: 'subiendo' })
      return reemplazarArchivo(recurso, file, {
        onProgress: (progreso) => {
          if (!vigente()) return
          const estado = estadoSegunProgreso(progreso)
          // Sin cambio devuelve el mismo objeto: React no vuelve a renderizar.
          setSubida((actual) =>
            actual?.progreso === progreso && actual.estado === estado ? actual : { progreso, estado },
          )
        },
        onReintento: () => {
          if (!vigente()) return
          setSubida((actual) =>
            actual?.estado === 'reintentando' ? actual : { progreso: actual?.progreso ?? 0, estado: 'reintentando' },
          )
        },
        signal: propio.signal,
      })
    },
    onSettled: () => {
      control.current = null
      setSubida(null)
      return invalidar()
    },
  })

  return {
    ...mutacion,
    progreso: subida?.progreso ?? 0,
    estadoSubida: subida?.estado ?? null,
    cancelar: () => control.current?.abort(),
  }
}

export function useEliminarRecurso() {
  const invalidar = useInvalidarTalleres()
  return useMutation({
    mutationFn: (recurso: Recurso) => eliminarRecurso(recurso),
    onSettled: invalidar,
  })
}

export function useOrdenarRecursos() {
  const invalidar = useInvalidarTalleres()
  return useMutation({
    mutationFn: ({ tallerId, ids }: { tallerId: number; ids: number[] }) => ordenarRecursos(tallerId, ids),
    onSuccess: invalidar,
  })
}

/** "Ver": firma la ruta (60 s) y abre el archivo en otra pestaña. */
export function useVerArchivo() {
  return useMutation({
    mutationFn: async (ruta: string) => {
      window.open(await urlFirmada(ruta), '_blank', 'noopener,noreferrer')
    },
  })
}

export type EstadoArchivo = {
  archivo: File
  estado: EstadoEnCurso | 'listo' | 'error' | 'cancelado'
  /** Entero de 0 a 100. */
  progreso: number
  motivo?: string
}

const TERMINADOS: EstadoArchivo['estado'][] = ['listo', 'error', 'cancelado']

/**
 * Alta de un lote de archivos, de a uno y en orden. El `orden` de cada uno se calcula una vez al empezar
 * (`max + 1 + i`) y no con la caché, que durante el lote está vieja. Un error no corta el lote; la caché de talleres
 * se invalida una sola vez al terminar (cada invalidación cancela el refetch anterior y pide el catálogo entero).
 * Cada archivo tiene su `AbortController`: `cancelar(indice)` lo aborta (un `AbortError` queda `cancelado`, no `error`)
 * y al desmontar se abortan todos, también los que esperan.
 */
export function useAltaArchivos() {
  const invalidar = useInvalidarTalleres()
  const [estados, setEstados] = useState<EstadoArchivo[]>([])
  const [enCurso, setEnCurso] = useState(false)
  // Índice del último archivo que terminó (listo, error o cancelado) por orden de llegada: no por posición en el lote.
  const [ultimoTerminado, setUltimoTerminado] = useState<number | null>(null)
  // Espejo de `estados`: permite no volver a renderizar cuando un evento de progreso no cambia nada.
  const actuales = useRef<EstadoArchivo[]>([])
  const controles = useRef<AbortController[]>([])

  useEffect(() => () => controles.current.forEach((c) => c.abort()), [])

  function publicar(siguientes: EstadoArchivo[]) {
    actuales.current = siguientes
    setEstados(siguientes)
  }

  function marcar(indice: number, cambio: Partial<Omit<EstadoArchivo, 'archivo'>>) {
    const actual = actuales.current[indice]
    if (!actual || TERMINADOS.includes(actual.estado)) return
    const siguiente = { ...actual, ...cambio }
    if (
      siguiente.estado === actual.estado &&
      siguiente.progreso === actual.progreso &&
      siguiente.motivo === actual.motivo
    ) {
      return
    }
    publicar(actuales.current.map((e, i) => (i === indice ? siguiente : e)))
    if (TERMINADOS.includes(siguiente.estado)) setUltimoTerminado(indice)
  }

  function cancelar(indice: number) {
    controles.current[indice]?.abort()
    // Uno que espera nunca llega a subir: se marca ya. Uno que sube queda cancelado cuando la subida rechaza.
    if (actuales.current[indice]?.estado === 'esperando') marcar(indice, { estado: 'cancelado' })
  }

  async function subir(tallerId: number, files: File[], recursos: Recurso[]): Promise<void> {
    // También con una lista vacía: un lote nuevo (aunque se rechace entero) borra los errores del anterior.
    controles.current = files.map(() => new AbortController())
    publicar(files.map((archivo) => ({ archivo, estado: 'esperando', progreso: 0 })))
    setUltimoTerminado(null)
    if (files.length === 0) return
    const primerOrden = ordenSiguiente(recursos)
    setEnCurso(true)
    try {
      for (const [i, file] of files.entries()) {
        const { signal } = controles.current[i]
        if (signal.aborted) {
          marcar(i, { estado: 'cancelado' })
          continue
        }
        marcar(i, { estado: 'subiendo' })
        try {
          await altaArchivo(tallerId, file, primerOrden + i, {
            onProgress: (progreso) => marcar(i, { progreso, estado: estadoSegunProgreso(progreso) }),
            onReintento: () => marcar(i, { estado: 'reintentando' }),
            signal,
          })
          marcar(i, { estado: 'listo' })
        } catch (error) {
          if (esCancelacion(error)) marcar(i, { estado: 'cancelado' })
          else marcar(i, { estado: 'error', motivo: mensajeDeErrorRecurso(error) })
        }
      }
    } finally {
      setEnCurso(false)
      await invalidar()
    }
  }

  return { subir, cancelar, estados, enCurso, ultimoTerminado }
}
