import type { Database, Tables } from '@/shared/types/database'

/** Una fila de `registro_operacion`: `datos_anteriores` y `datos_nuevos` son la fila completa (jsonb), no un diff. */
export type Operacion = Tables<'registro_operacion'>

/** Una fila de `usuarios_historial()`: quién tiene operaciones registradas y con qué email. */
export type UsuarioHistorial = Database['public']['Functions']['usuarios_historial']['Returns'][number]
