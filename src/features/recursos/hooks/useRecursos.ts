import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CLAVE_TALLERES } from '@/features/talleres/hooks/useTalleres'
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
    onSuccess: invalidar,
  })
}

export function useReemplazarArchivo() {
  const invalidar = useInvalidarTalleres()
  return useMutation({
    mutationFn: ({ recurso, file }: { recurso: Recurso; file: File }) => reemplazarArchivo(recurso, file),
    onSuccess: invalidar,
  })
}

export function useEliminarRecurso() {
  const invalidar = useInvalidarTalleres()
  return useMutation({
    mutationFn: (recurso: Recurso) => eliminarRecurso(recurso),
    onSuccess: invalidar,
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
  estado: 'esperando' | 'subiendo' | 'listo' | 'error'
  motivo?: string
}

/**
 * Alta de un lote de archivos, de a uno y en orden. El `orden` de cada uno se calcula una vez al empezar
 * (`max + 1 + i`) y no con la caché, que durante el lote está vieja. Un error no corta el lote; la caché de talleres
 * se invalida una sola vez al terminar (cada invalidación cancela el refetch anterior y pide el catálogo entero).
 */
export function useAltaArchivos() {
  const invalidar = useInvalidarTalleres()
  const [estados, setEstados] = useState<EstadoArchivo[]>([])
  const [enCurso, setEnCurso] = useState(false)

  function marcar(indice: number, cambio: Omit<EstadoArchivo, 'archivo'>) {
    setEstados((actuales) => actuales.map((e, i) => (i === indice ? { ...e, ...cambio } : e)))
  }

  async function subir(tallerId: number, files: File[], recursos: Recurso[]): Promise<void> {
    // También con una lista vacía: un lote nuevo (aunque se rechace entero) borra los errores del anterior.
    setEstados(files.map((archivo) => ({ archivo, estado: 'esperando' })))
    if (files.length === 0) return
    const primerOrden = ordenSiguiente(recursos)
    setEnCurso(true)
    try {
      for (const [i, file] of files.entries()) {
        marcar(i, { estado: 'subiendo' })
        try {
          await altaArchivo(tallerId, file, primerOrden + i)
          marcar(i, { estado: 'listo' })
        } catch (error) {
          marcar(i, { estado: 'error', motivo: mensajeDeErrorRecurso(error) })
        }
      }
    } finally {
      setEnCurso(false)
      await invalidar()
    }
  }

  return { subir, estados, enCurso }
}
