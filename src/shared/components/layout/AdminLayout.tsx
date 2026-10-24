import { useState } from 'react'
import { Navigate, Outlet, useLocation, useMatches } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { AvisoInactividad } from '@/features/auth/components/AvisoInactividad'
import { useInactividad } from '@/features/auth/useInactividad'
import { Skeleton } from '@/shared/components/ui/Skeleton'
import { SkipLink } from '@/shared/components/ui/SkipLink'
import { AdminHeader } from './AdminHeader'
import { AdminSidebar } from './AdminSidebar'

/** §5.2: cierre de sesión tras 30 minutos sin actividad, con aviso 2 minutos antes. */
const LIMITE_INACTIVIDAD_MS = 30 * 60_000
const AVISO_INACTIVIDAD_MS = 2 * 60_000

export function AdminLayout() {
  const { usuario, cargando, cerrarSesion } = useAuth()
  const [vencidaPorInactividad, setVencidaPorInactividad] = useState(false)
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const matches = useMatches() as { handle?: { title?: string } }[]
  const title = matches.findLast((m) => m.handle?.title)?.handle?.title ?? 'Panel de Administración'

  const { aviso, venceEn, extender } = useInactividad({
    activo: !!usuario,
    limiteMs: LIMITE_INACTIVIDAD_MS,
    avisoMs: AVISO_INACTIVIDAD_MS,
    onVencida: () => {
      // Se marca antes de cerrar: al caer el usuario, el <Navigate> de abajo lleva el motivo al login.
      setVencidaPorInactividad(true)
      // Si signOut falla (access token vencido y sin red), cerrarSesion descarta la sesión y recarga en el
      // login (#46). El rechazo no tiene nada más que hacer acá.
      cerrarSesion().catch(() => {})
    },
  })

  if (cargando) {
    return (
      <div role="status" aria-label="Cargando" className="flex min-h-screen bg-gray-50">
        <Skeleton className="hidden h-screen w-64 rounded-none lg:block" />
        <div className="flex-1 space-y-4 p-6 lg:p-10">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  if (!usuario) {
    return (
      <Navigate
        to="/admin/login"
        state={{ from: location, ...(vencidaPorInactividad && { motivo: 'inactividad' }) }}
        replace
      />
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <SkipLink />
      <div className="hidden lg:block">
        <AdminSidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full">
            <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AdminHeader title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>

      {aviso && venceEn !== null && <AvisoInactividad venceEn={venceEn} onSeguir={extender} />}
    </div>
  )
}
