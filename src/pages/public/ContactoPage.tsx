import { Mail, MapPin, Phone } from 'lucide-react'

export function ContactoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-primary-800">Contacto</h1>
      <p className="mt-1 text-sm text-gray-500">Comunicate con la Subsecretaría de Educación.</p>

      <dl className="mt-6 space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <Phone className="h-5 w-5 text-primary-600" aria-hidden="true" />
          <div>
            <dt className="text-xs text-gray-400">Teléfono</dt>
            <dd className="font-medium text-gray-800">0800 555 1234</dd>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <Mail className="h-5 w-5 text-primary-600" aria-hidden="true" />
          <div>
            <dt className="text-xs text-gray-400">Correo</dt>
            <dd className="font-medium text-gray-800">info@educacion.gob.ar</dd>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <MapPin className="h-5 w-5 text-primary-600" aria-hidden="true" />
          <div>
            <dt className="text-xs text-gray-400">Dirección</dt>
            <dd className="font-medium text-gray-800">Pizzurno 935, C1020ACA CABA</dd>
          </div>
        </div>
      </dl>
    </div>
  )
}
