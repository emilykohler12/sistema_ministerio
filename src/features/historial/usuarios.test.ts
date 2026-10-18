import { describe, expect, it } from 'vitest'
import { nombreDeUsuario } from './usuarios'

/*
 * Contrato (crítica del código, punto 4):
 *   nombreDeUsuario(id: string | null, emails: ReadonlyMap<string, string>): string
 *   - null -> 'Sistema'; id con email -> el email; id sin email (falló la consulta o aún no cargó) -> los primeros 8 caracteres.
 */
const UUID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'

describe('nombreDeUsuario', () => {
  it('sin usuario es "Sistema"', () => {
    expect(nombreDeUsuario(null, new Map())).toBe('Sistema')
  })

  it('con email conocido devuelve el email', () => {
    expect(nombreDeUsuario(UUID, new Map([[UUID, 'admin@dam.local']]))).toBe('admin@dam.local')
  })

  it('sin email devuelve el uuid corto (8 caracteres)', () => {
    expect(nombreDeUsuario(UUID, new Map())).toBe('3f2b8c1e')
    expect(nombreDeUsuario(UUID, new Map([['otro', 'otro@dam.local']]))).toBe('3f2b8c1e')
  })
})
