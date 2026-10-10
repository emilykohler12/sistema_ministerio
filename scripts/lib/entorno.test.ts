// @vitest-environment node
// Spec: docs/specs/padron/fase-b.md, criterio 7.
import { describe, expect, it } from 'vitest'
import { esUrlLocal, resolverDestino } from './entorno.ts'

describe('esUrlLocal', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://localhost'])('acepta %s', (url) => {
    expect(esUrlLocal(url)).toBe(true)
  })

  it.each([
    'https://abc.supabase.co',
    'https://127.0.0.1:54321',
    'http://localhost.evil.com',
    'http://127.0.0.1.evil.com',
    'http://evil.com/localhost',
    'no es una url',
    '',
  ])('rechaza %s', (url) => {
    expect(esUrlLocal(url)).toBe(false)
  })
})

describe('resolverDestino', () => {
  const NUBE = 'https://abc.supabase.co'

  it('sin SUPABASE_URL el destino es el Supabase local (el orquestador usa supabase status)', () => {
    expect(resolverDestino({}, ['f.csv'])).toEqual({ modo: 'local' })
  })

  it('una SUPABASE_URL local sigue siendo local y no exige clave ni --confirmar', () => {
    expect(resolverDestino({ SUPABASE_URL: 'http://127.0.0.1:54321' }, [])).toMatchObject({ modo: 'local' })
  })

  it('con una URL de la nube, clave y --confirmar=<host> exacto devuelve url, host y clave', () => {
    const env = { SUPABASE_URL: NUBE, SUPABASE_SERVICE_ROLE_KEY: 'k' }
    expect(resolverDestino(env, ['f.csv', '--confirmar=abc.supabase.co', '--aplicar'])).toEqual({
      modo: 'nube',
      url: NUBE,
      host: 'abc.supabase.co',
      clave: 'k',
    })
  })

  it('con una URL de la nube sin SUPABASE_SERVICE_ROLE_KEY aborta', () => {
    expect(() => resolverDestino({ SUPABASE_URL: NUBE }, ['--confirmar=abc.supabase.co'])).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    )
  })

  it('con una URL de la nube sin --confirmar aborta', () => {
    const env = { SUPABASE_URL: NUBE, SUPABASE_SERVICE_ROLE_KEY: 'k' }
    expect(() => resolverDestino(env, ['f.csv'])).toThrow(/--confirmar/)
  })

  it('--confirmar sin valor no alcanza', () => {
    const env = { SUPABASE_URL: NUBE, SUPABASE_SERVICE_ROLE_KEY: 'k' }
    expect(() => resolverDestino(env, ['--confirmar'])).toThrow(/--confirmar/)
    expect(() => resolverDestino(env, ['--confirmar='])).toThrow(/--confirmar/)
  })

  it('--confirmar con otro host aborta y nombra el host real', () => {
    const env = { SUPABASE_URL: NUBE, SUPABASE_SERVICE_ROLE_KEY: 'k' }
    expect(() => resolverDestino(env, ['--confirmar=otro.supabase.co'])).toThrow(/abc\.supabase\.co/)
  })

  it('el host debe ser exacto, no un prefijo ni un sufijo', () => {
    const env = { SUPABASE_URL: NUBE, SUPABASE_SERVICE_ROLE_KEY: 'k' }
    expect(() => resolverDestino(env, ['--confirmar=abc'])).toThrow()
    expect(() => resolverDestino(env, ['--confirmar=abc.supabase.co.evil.com'])).toThrow()
  })

  it('una SUPABASE_URL inválida aborta', () => {
    expect(() => resolverDestino({ SUPABASE_URL: 'no es una url', SUPABASE_SERVICE_ROLE_KEY: 'k' }, [])).toThrow()
  })
})
