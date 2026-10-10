import { Mail, Phone } from 'lucide-react'
import { useConfiguracion } from '@/features/configuracion/hooks/useConfiguracion'
import { getInitials } from '@/shared/lib/utils'

export function PublicFooter() {
  const { data: config } = useConfiguracion()
  const nombre = config?.nombre || 'Sitio institucional'
  const iniciales = getInitials(config?.nombre ?? '')

  return (
    <footer className="mt-auto bg-primary-800 text-white">
      <div className="mx-auto flex flex-col items-center gap-4 px-4 py-6 text-sm sm:flex-row sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 font-semibold">
          {/* Sin URL de Storage todavía (logo diferido): hasta entonces siempre iniciales. */}
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-xs font-bold text-primary-800"
            aria-hidden="true"
          >
            {iniciales}
          </span>
          <p>{nombre}</p>
        </div>

        <div className="flex flex-col items-center gap-2 sm:items-start">
          {config?.telefono && (
            <a href={`tel:${config.telefono.replace(/\s+/g, '')}`} className="flex items-center gap-2 text-white hover:underline">
              <Phone className="h-4 w-4" aria-hidden="true" /> {config.telefono}
            </a>
          )}
          {config?.correo && (
            <a href={`mailto:${config.correo}`} className="flex items-center gap-2 text-white hover:underline">
              <Mail className="h-4 w-4" aria-hidden="true" /> {config.correo}
            </a>
          )}
        </div>

        {(config?.facebook || config?.instagram) && (
          <ul className="flex items-center gap-4 text-sm font-medium">
            {config.facebook && (
              <li>
                <a href={config.facebook} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  Facebook
                </a>
              </li>
            )}
            {config.instagram && (
              <li>
                <a href={config.instagram} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  Instagram
                </a>
              </li>
            )}
          </ul>
        )}
      </div>
    </footer>
  )
}
