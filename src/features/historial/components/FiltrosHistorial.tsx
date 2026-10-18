import { useEffect, useId, useState } from 'react'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Select } from '@/shared/components/ui/Select'
import { ENTIDADES_FILTRABLES } from '../entidades'
import type { FiltrosHistorial as Filtros } from '../filtros'
import { nombreDeUsuario } from '../usuarios'

/**
 * Espera a que termine de editar las fechas: al escribir el año, el navegador emite fechas intermedias válidas (0002-…, 0020-…)
 * que no hay que consultar. Mismo criterio que `SelectorPeriodo` del dashboard.
 */
const ESPERA_FECHAS_MS = 300

interface FiltrosHistorialProps {
  filtros: Filtros
  /** Mensaje de `validarFiltros`, o null si los filtros son válidos. */
  error: string | null
  /** Email por `usuario_id` (en el orden de la RPC); vacío si falló o no cargó: los usuarios se ven por uuid corto. */
  emails: ReadonlyMap<string, string>
  /** Falló la consulta de usuarios: la lista sigue, pero los usuarios se ven por uuid corto. */
  errorUsuarios: boolean
  /** Usuario y entidad: se aplican al instante. */
  onCambiar: (cambios: Partial<Filtros>) => void
  /** Las fechas, ya con la espera. Vacías = sin límite. */
  onFechas: (desde: string | null, hasta: string | null) => void
}

export function FiltrosHistorial({
  filtros,
  error,
  emails,
  errorUsuarios,
  onCambiar,
  onFechas,
}: FiltrosHistorialProps) {
  const idError = useId()
  const idDesde = useId()
  const idHasta = useId()
  const idUsuario = useId()
  const idEntidad = useId()
  const [borrador, setBorrador] = useState({ desde: filtros.desde ?? '', hasta: filtros.hasta ?? '' })
  const [vistos, setVistos] = useState({ desde: filtros.desde ?? '', hasta: filtros.hasta ?? '' })

  // Si las fechas cambian desde afuera (URL, atrás/adelante, "Limpiar filtros"), los campos las siguen.
  if (vistos.desde !== (filtros.desde ?? '') || vistos.hasta !== (filtros.hasta ?? '')) {
    const actuales = { desde: filtros.desde ?? '', hasta: filtros.hasta ?? '' }
    setVistos(actuales)
    setBorrador(actuales)
  }

  const { desde, hasta } = borrador
  const hayCambio = desde !== (filtros.desde ?? '') || hasta !== (filtros.hasta ?? '')
  useEffect(() => {
    if (!hayCambio) return
    const espera = setTimeout(() => onFechas(desde || null, hasta || null), ESPERA_FECHAS_MS)
    return () => clearTimeout(espera)
  }, [hayCambio, desde, hasta, onFechas])

  // Un usuario de la URL que todavía no está en la lista (carga o error) igual se muestra elegido.
  const usuarioFueraDeLista = filtros.usuario !== null && filtros.usuario !== 'sistema' && !emails.has(filtros.usuario)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Label htmlFor={idDesde}>Desde</Label>
          <Input
            id={idDesde}
            type="date"
            className="w-44"
            value={desde}
            error={error !== null}
            aria-describedby={error ? idError : undefined}
            onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor={idHasta}>Hasta</Label>
          <Input
            id={idHasta}
            type="date"
            className="w-44"
            value={hasta}
            error={error !== null}
            aria-describedby={error ? idError : undefined}
            onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor={idUsuario}>Usuario</Label>
          <Select
            id={idUsuario}
            className="w-64"
            value={filtros.usuario ?? ''}
            onChange={(e) => onCambiar({ usuario: e.target.value || null })}
          >
            <option value="">Todos</option>
            <option value="sistema">Sistema</option>
            {usuarioFueraDeLista && filtros.usuario && (
              <option value={filtros.usuario}>{nombreDeUsuario(filtros.usuario, emails)}</option>
            )}
            {[...emails.keys()].map((id) => (
              <option key={id} value={id}>
                {nombreDeUsuario(id, emails)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={idEntidad}>Entidad</Label>
          <Select
            id={idEntidad}
            className="w-52"
            value={filtros.entidad ?? ''}
            onChange={(e) => onCambiar({ entidad: e.target.value || null })}
          >
            <option value="">Todas</option>
            {ENTIDADES_FILTRABLES.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <FieldError id={idError} message={error ?? undefined} />
      {errorUsuarios && (
        <p className="text-sm text-amber-700">
          No pudimos cargar los emails de los usuarios: se muestran por su identificador.
        </p>
      )}
    </div>
  )
}
