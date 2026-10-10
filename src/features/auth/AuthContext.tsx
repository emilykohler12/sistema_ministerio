import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { cerrarSesion, escucharSesion, iniciarSesion as iniciarSesionConsulta } from './consultas'
import { esAdmin } from './esAdmin'

export interface UsuarioAdmin {
  id: string
  email: string | undefined
}

export type ErrorInicioSesion = 'credenciales' | 'sin-permiso' | 'red'

interface AuthState {
  usuario: UsuarioAdmin | null
  cargando: boolean
  iniciarSesion: (correo: string, password: string) => Promise<ErrorInicioSesion | null>
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [usuario, setUsuario] = useState<UsuarioAdmin | null>(null)
  const [cargando, setCargando] = useState(true)

  // Única fuente de la sesión. Regla: nunca llamar a supabase.auth.* de forma sincrónica
  // dentro del callback (puede trabar el cliente); por eso el cierre se difiere.
  useEffect(() => {
    return escucharSesion((evento, session) => {
      const user = session?.user
      if (user && esAdmin(user)) {
        setUsuario({ id: user.id, email: user.email })
      } else {
        setUsuario(null)
        // signOut borra la sesión local aunque falle la red: el rechazo no tiene nada más que hacer.
        if (user) setTimeout(() => cerrarSesion().catch(() => {}), 0)
      }
      if (evento === 'INITIAL_SESSION') setCargando(false)
      if (evento === 'SIGNED_OUT') queryClient.clear()
    })
  }, [queryClient])

  async function iniciarSesion(
    correo: string,
    password: string,
  ): Promise<ErrorInicioSesion | null> {
    try {
      const { user, error } = await iniciarSesionConsulta(correo, password)
      if (error) return error.code === 'invalid_credentials' ? 'credenciales' : 'red'
      if (!esAdmin(user)) return 'sin-permiso'
      return null
    } catch {
      return 'red'
    }
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
