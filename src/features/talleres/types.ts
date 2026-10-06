export type Nivel = 'inicial' | 'primario' | 'secundario' | 'terciario' | 'formacion-profesional' | 'todos'

export const NIVELES: { value: Nivel; label: string }[] = [
  { value: 'inicial', label: 'Inicial' },
  { value: 'primario', label: 'Primario' },
  { value: 'secundario', label: 'Secundario' },
  { value: 'terciario', label: 'Terciario' },
  { value: 'formacion-profesional', label: 'Formación profesional' },
  { value: 'todos', label: 'Todos los niveles' },
]

export const NIVELES_FILTRO: { value: Nivel; label: string }[] = NIVELES.filter((n) => n.value !== 'todos')

export const NIVEL_VALUES = ['inicial', 'primario', 'secundario', 'terciario', 'formacion-profesional', 'todos'] as const

export function nivelLabel(nivel: Nivel) {
  return NIVELES.find((n) => n.value === nivel)?.label ?? nivel
}

export type Destinatario = 'directivos' | 'familias' | 'estudiantes' | 'docentes' | 'comunidad'

export const DESTINATARIOS: { value: Destinatario; label: string }[] = [
  { value: 'directivos', label: 'Directivos' },
  { value: 'familias', label: 'Familias' },
  { value: 'estudiantes', label: 'Estudiantes' },
  { value: 'docentes', label: 'Docentes' },
  { value: 'comunidad', label: 'Comunidad educativa' },
]

export function destinatarioLabel(destinatario: Destinatario) {
  return DESTINATARIOS.find((d) => d.value === destinatario)?.label ?? destinatario
}

export interface Categoria {
  id: string
  nombre: string
  nivel: Nivel
  descripcion?: string
}

export type TipoRecurso = 'pdf' | 'video' | 'imagen'

export interface RecursoArchivo {
  nombre: string
  tipo: TipoRecurso
}

export type EstadoTaller = 'borrador' | 'publicado' | 'inactivo'

export interface Taller {
  id: string
  categoriaId: string
  titulo: string
  descripcion: string
  nivel: Nivel
  destinatarios: Destinatario[]
  etiquetas: string[]
  fecha: string
  responsable: string
  recursos: RecursoArchivo[]
  descargas: number
  estado: EstadoTaller
}
