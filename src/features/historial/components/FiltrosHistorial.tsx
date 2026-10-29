import { useCallback, useId } from 'react'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Label } from '@/shared/components/ui/Label'
import { RangoFechas } from '@/shared/components/ui/RangoFechas'
import { Select } from '@/shared/components/ui/Select'
import { ENTIDADES_FILTRABLES } from '../entidades'
import type { FiltrosHistorial as Filtros } from '../filtros'
import { nombreDeUsuario } from '../usuarios'

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
  const idUsuario = useId()
  const idEntidad = useId()
  // Las fechas vacías son "sin límite".
  const alCambiarFechas = useCallback(
    (desde: string, hasta: string) => onFechas(desde || null, hasta || null),
    [onFechas],
  )

  // Un usuario de la URL que todavía no está en la lista (carga o error) igual se muestra elegido.
  const usuarioFueraDeLista = filtros.usuario !== null && filtros.usuario !== 'sistema' && !emails.has(filtros.usuario)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-4">
        <RangoFechas
          desde={filtros.desde ?? ''}
          hasta={filtros.hasta ?? ''}
          error={error}
          idError={idError}
          onCambio={alCambiarFechas}
        />
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
