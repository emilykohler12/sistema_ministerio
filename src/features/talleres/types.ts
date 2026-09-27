export type Nivel = 'inicial' | 'primario' | 'secundario' | 'terciario' | 'todos'

export const NIVELES: { value: Nivel; label: string }[] = [
  { value: 'inicial', label: 'Inicial' },
  { value: 'primario', label: 'Primario' },
  { value: 'secundario', label: 'Secundario' },
  { value: 'terciario', label: 'Terciario' },
  { value: 'todos', label: 'Todos los niveles' },
]

export const NIVELES_FILTRO: { value: Nivel; label: string }[] = NIVELES.filter((n) => n.value !== 'todos')

export type Destinatario = 'docentes' | 'padres' | 'estudiantes'

export const DESTINATARIOS: { value: Destinatario; label: string }[] = [
  { value: 'docentes', label: 'Docentes' },
  { value: 'padres', label: 'Padres' },
  { value: 'estudiantes', label: 'Estudiantes' },
]

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
