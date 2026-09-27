import { createContext, type ReactNode, useContext, useState } from 'react'

interface AuthState {
  isAuthenticated: boolean
  responsable: string | null
  login: (responsable: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [responsable, setResponsable] = useState<string | null>(() =>
    sessionStorage.getItem('dam-responsable'),
  )

  function login(name: string) {
    sessionStorage.setItem('dam-responsable', name)
    setResponsable(name)
  }

  function logout() {
    sessionStorage.removeItem('dam-responsable')
    setResponsable(null)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!responsable, responsable, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
