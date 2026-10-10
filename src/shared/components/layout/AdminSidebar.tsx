import { Home, LayoutGrid, LogOut, ScrollText, Settings, BookOpen } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { cn } from '@/shared/lib/utils'

const links = [
  { to: '/admin', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/talleres', label: 'Talleres', icon: BookOpen },
  { to: '/admin/normativas', label: 'Normativas', icon: ScrollText },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { cerrarSesion } = useAuth()

  // La redirección al login la hace AdminLayout cuando `usuario` pasa a null.
  // signOut borra la sesión local aunque falle la red: el rechazo no tiene nada más que hacer.
  function handleLogout() {
    cerrarSesion().catch(() => {})
  }

  return (
    <div className="flex h-full w-64 flex-col bg-primary-900 text-white">
      <div className="flex items-center gap-2 px-5 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-sm font-bold text-primary-900">
          SE
        </span>
        <div className="text-sm font-semibold leading-tight">
          <p>Subsecretaría</p>
          <p>de Educación</p>
        </div>
      </div>

      <nav aria-label="Administración" className="flex-1 space-y-1 px-3">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-primary-100 transition-colors hover:bg-primary-800',
                isActive && 'bg-primary-700 text-white',
              )
            }
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <Link
        to="/"
        onClick={onNavigate}
        className="mx-3 mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-primary-100 hover:bg-primary-800"
      >
        <Home className="h-5 w-5" aria-hidden="true" />
        Ir a inicio
      </Link>

      <button
        type="button"
        onClick={handleLogout}
        className="mx-3 mb-6 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-primary-100 hover:bg-primary-800"
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
        Cerrar sesión
      </button>
    </div>
  )
}
