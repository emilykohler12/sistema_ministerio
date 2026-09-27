import { useState } from 'react'
import { LogIn, Menu, School, X } from 'lucide-react'
import { NavLink, Link } from 'react-router-dom'
import { useConfiguracion } from '@/features/configuracion/hooks/useConfiguracion'
import { cn, getInitials } from '@/shared/lib/utils'

const links = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/normativas', label: 'Normativas' },
  { to: '/talleres', label: 'Talleres' },
  { to: '/contacto', label: 'Contacto' },
]

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { data: config } = useConfiguracion()
  const nombre = config?.nombre || 'Sitio institucional'
  const iniciales = getInitials(config?.nombre ?? '')

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 rounded-md">
          {config?.logoUrl ? (
            <img src={config.logoUrl} alt={`Logo de ${nombre}`} className="h-9 w-9 rounded-md object-cover" />
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-800 text-sm font-bold text-white"
              aria-hidden="true"
            >
              {iniciales || <School className="h-4 w-4" />}
            </span>
          )}
          <span className="text-sm font-semibold leading-tight text-primary-800">{nombre}</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'border-b-2 border-transparent pb-1 text-sm font-medium text-gray-600 hover:text-primary-700',
                  isActive && 'border-primary-600 text-primary-700',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
          <Link
            to="/admin/login"
            className="flex items-center gap-1.5 rounded-lg border border-primary-700 px-3.5 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Ingresar
          </Link>
        </nav>

        <button
          type="button"
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100 md:hidden"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {menuOpen && (
        <nav aria-label="Principal móvil" className="flex flex-col gap-1 border-t border-gray-200 px-4 py-2 md:hidden">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50',
                  isActive && 'bg-primary-50 text-primary-700',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
          <Link
            to="/admin/login"
            onClick={() => setMenuOpen(false)}
            className="mt-1 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Ingresar al panel de administración
          </Link>
        </nav>
      )}
    </header>
  )
}
