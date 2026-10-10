import type { User } from '@supabase/supabase-js'

/** Solo UX: la barrera real es `es_admin()` en la RLS. Módulo puro: no importa el cliente. */
export function esAdmin(user: User | null | undefined): boolean {
  return user?.app_metadata?.admin === true
}
