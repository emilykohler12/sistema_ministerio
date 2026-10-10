// Utilidades para testear componentes que usan useAuth. Van aparte de utils.tsx: si utils importara
// AuthProvider, todos los tests con renderConProviders cargarían `consultas` (y el cliente) sin mock.
//
// Cada test que las use tiene que declarar, en su propio archivo (Vitest eleva vi.mock al inicio):
//   vi.mock('@/features/auth/consultas', () => ({
//     iniciarSesion: vi.fn(), cerrarSesion: vi.fn(), escucharSesion: vi.fn(),
//   }))
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { act } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthContext'
import { cerrarSesion, escucharSesion } from '@/features/auth/consultas'
import { crearQueryClient } from './utils'

type Callback = (evento: string, session: unknown) => void

export const sesionAdmin = {
  user: { id: 'u1', email: 'admin@dam.local', app_metadata: { admin: true }, user_metadata: {} },
}

export const sesionSinMarca = {
  user: { id: 'u2', email: 'sin-permiso@dam.local', app_metadata: {}, user_metadata: {} },
}

/**
 * Captura el callback que el AuthProvider registra en `escucharSesion` (mockeado) y deja
 * `cerrarSesion` resolviendo. Llamarla en `beforeEach`, después de `vi.clearAllMocks()`.
 * `emitir` envuelve la llamada en `act`; `desuscribir` es la baja que devuelve `escucharSesion`.
 */
export function simularSesion() {
  let callback: Callback | undefined
  const desuscribir = vi.fn()
  vi.mocked(cerrarSesion).mockResolvedValue(undefined)
  vi.mocked(escucharSesion).mockImplementation((cb) => {
    callback = cb as Callback
    return desuscribir
  })
  function emitir(evento: string, session: unknown) {
    if (!callback) throw new Error('El AuthProvider todavía no se suscribió a escucharSesion')
    const cb = callback
    act(() => cb(evento, session))
  }
  return { emitir, desuscribir }
}

/** QueryClientProvider + AuthProvider reales. Cada test pone el router que necesita. */
export function ConAuth({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [cliente] = useState(() => client ?? crearQueryClient())
  return (
    <QueryClientProvider client={cliente}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
