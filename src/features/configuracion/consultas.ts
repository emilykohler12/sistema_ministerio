import { borrarArchivo, subirArchivo } from '@/shared/lib/storage'
import { supabase } from '@/shared/lib/supabase'
import { mimeDeLogo } from './archivos'
import type { Configuracion, ConfiguracionCambios } from './types'

const BUCKET = 'logo'

export async function obtenerConfiguracion(): Promise<Configuracion> {
  const { data, error } = await supabase.from('configuracion').select('*').eq('id', 1).single()
  if (error) throw error
  return data
}

/** Si la RLS bloquea el UPDATE, no queda ninguna fila y `.single()` lo devuelve como error. */
export async function guardarConfiguracion(cambios: ConfiguracionCambios): Promise<Configuracion> {
  const { data, error } = await supabase
    .from('configuracion')
    .update(cambios)
    .eq('id', 1)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * UPDATE condicional de `logo_ruta`: solo se aplica si la fila todavía apunta a `anterior` (`.is(…, null)` si no había
 * logo). Si otro admin lo cambió mientras, no queda ninguna fila y `.single()` da `PGRST116`. Así la ruta que quien
 * llama borra después es la que estaba en la base, no la de la caché.
 */
export async function actualizarLogo(nueva: string | null, anterior: string | null): Promise<Configuracion> {
  const base = supabase.from('configuracion').update({ logo_ruta: nueva }).eq('id', 1)
  const { data, error } = await (anterior === null ? base.is('logo_ruta', null) : base.eq('logo_ruta', anterior))
    .select()
    .single()
  if (error) throw error
  return data
}

export const subirLogo = (ruta: string, file: File) => subirArchivo(BUCKET, ruta, file, mimeDeLogo(file))

export const borrarLogo = (ruta: string) => borrarArchivo(BUCKET, ruta)

/** URL pública del logo (arma el texto en el cliente, sin red). */
export const urlLogo = (ruta: string) => supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
