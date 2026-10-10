import { useState } from 'react'
import { Navigate, Outlet, useLocation, useMatches } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { Skeleton } from '@/shared/components/ui/Skeleton'
import { SkipLink } from '@/shared/components/ui/SkipLink'
import { AdminHeader } from './AdminHeader'
import { AdminSidebar } from './AdminSidebar'

export function AdminLayout() {
  const { usuario, cargando } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const matches = useMatches() as { handle?: { title?: string } }[]
  const title = matches.findLast((m) => m.handle?.title)?.handle?.title ?? 'Panel de Administración'

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
    return <Navigate to="/admin/login" state={{ from: location }} replace />
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

      <div className="flex min-h-screen flex-1 flex-col">
        <AdminHeader title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
