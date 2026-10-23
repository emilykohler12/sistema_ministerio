import { Globe, Mail, MapPin, Phone, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useConfiguracion } from '@/features/configuracion/hooks/useConfiguracion'
import { ErrorFallback } from '@/shared/components/ui/ErrorFallback'
import { ListSkeleton } from '@/shared/components/ui/Skeleton'

function DatoDeContacto({ icono: Icono, etiqueta, children }: { icono: LucideIcon; etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <Icono className="h-5 w-5 text-primary-600" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-gray-400">{etiqueta}</dt>
        <dd className="break-words font-medium text-gray-800">{children}</dd>
      </div>
    </div>
  )
}

export function ContactoPage() {
  const { data: config, isPending, isError, refetch } = useConfiguracion()
  const hayDatos = Boolean(
    config?.telefono || config?.correo || config?.direccion || config?.facebook || config?.instagram,
  )

  return (
    <div className="px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-primary-800">Contacto</h1>
      <p className="mt-1 text-sm text-gray-500">Comunicate con {config?.nombre || 'nosotros'}.</p>

      {isError ? (
        <div className="mt-6">
          <ErrorFallback message="No pudimos cargar los datos de contacto." onRetry={() => void refetch()} />
        </div>
      ) : isPending ? (
        <div className="mt-6">
          <ListSkeleton />
        </div>
      ) : hayDatos ? (
        <dl className="mt-6 space-y-4">
          {config?.telefono && (
            <DatoDeContacto icono={Phone} etiqueta="Teléfono">
              <a href={`tel:${config.telefono.replace(/\s+/g, '')}`} className="hover:underline">
                {config.telefono}
              </a>
            </DatoDeContacto>
          )}
          {config?.correo && (
            <DatoDeContacto icono={Mail} etiqueta="Correo">
              <a href={`mailto:${config.correo}`} className="hover:underline">
                {config.correo}
              </a>
            </DatoDeContacto>
          )}
          {config?.direccion && (
            <DatoDeContacto icono={MapPin} etiqueta="Dirección">
              {config.direccion}
            </DatoDeContacto>
          )}
          {config?.facebook && (
            <DatoDeContacto icono={Globe} etiqueta="Facebook">
              <a href={config.facebook} target="_blank" rel="noreferrer" className="hover:underline">
                {config.facebook}
              </a>
            </DatoDeContacto>
          )}
          {config?.instagram && (
            <DatoDeContacto icono={Globe} etiqueta="Instagram">
              <a href={config.instagram} target="_blank" rel="noreferrer" className="hover:underline">
                {config.instagram}
              </a>
            </DatoDeContacto>
          )}
        </dl>
      ) : (
        <p className="mt-6 text-sm text-gray-500">Todavía no hay datos de contacto</p>
      )}
    </div>
  )
}
