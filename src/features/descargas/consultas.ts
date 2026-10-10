import { nombreDeDescarga } from '@/features/recursos/archivos'
import type { Recurso } from '@/features/recursos/types'
import { supabase } from '@/shared/lib/supabase'
import type { DatosDescarga, EnlaceDescarga } from './types'

const BUCKET = 'talleres'
/** Vigencia de los enlaces firmados: una hora. */
const VIGENCIA_SEGUNDOS = 3600

/**
 * Registra la descarga con la RPC `registrar_descarga` (0022), que normaliza los campos según su discriminador.
 * Lo que no se completó viaja ausente (la RPC lo toma como null). Lanza el error de la RPC conservando su `code`
 * (`DA003`, `DA004`).
 */
export async function registrarDescarga(tallerId: number, datos: DatosDescarga): Promise<void> {
  const { error } = await supabase.rpc('registrar_descarga', {
    p_taller_id: tallerId,
    p_cargo: datos.cargo,
    p_localidad_id: datos.localidad_id,
    p_institucion_tipo: datos.institucion_tipo,
    p_cargo_otro: datos.cargo_otro ?? undefined,
    p_establecimiento_id: datos.establecimiento_id ?? undefined,
    p_institucion_otra: datos.institucion_otra ?? undefined,
  })
  if (error) throw error
}

/**
 * Enlaces para abrir los recursos de un taller, en el orden de `orden` (desempate por `id`). Los archivos se firman en
 * paralelo con `createSignedUrl` (el bucket es privado; anon puede firmar solo los de talleres publicados) y el nombre
 * de descarga sale de `nombreDeDescarga`; los enlaces externos pasan tal cual. Si falla una firma, lanza.
 */
export async function firmarEnlaces(recursos: Recurso[]): Promise<EnlaceDescarga[]> {
  const ordenados = [...recursos].sort((a, b) => a.orden - b.orden || a.id - b.id)
  return Promise.all(
    ordenados.map(async (recurso): Promise<EnlaceDescarga> => {
      if (recurso.ruta_archivo === null) return { recurso, url: recurso.url ?? '' }
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(recurso.ruta_archivo, VIGENCIA_SEGUNDOS, { download: nombreDeDescarga(recurso) })
      if (error) throw error
      return { recurso, url: data.signedUrl }
    }),
  )
}
