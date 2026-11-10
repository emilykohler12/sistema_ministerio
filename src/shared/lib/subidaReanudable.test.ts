import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onShouldRetry, subirReanudable } from './subidaReanudable'

/*
 * Contrato (spec subida-reanudable, #29). src/shared/lib/subidaReanudable.ts, sobre tus-js-client (mockeado con una clase falsa):
 *   subirReanudable(bucket, ruta, file, mime, { onProgress?, onReintento?, signal? }): Promise<void>
 *     - onProgress(porcentaje): entero 0-100 que nunca retrocede (max entre el anterior y el actual; onChunkComplete fija un piso).
 *     - onReintento(): se llama cada vez que se decide reintentar.
 *     - rechaza con { statusCode: string } (el status HTTP real; si el HTTP es 400 y el cuerpo es JSON con `statusCode`, gana el del cuerpo)
 *       o con un error de nombre 'AbortError' si se cancela con `signal`.
 *   onShouldRetry(error, onReintento?): boolean  (pura; `error.originalResponse?.getStatus()`, sin respuesta = status 0)
 *     reintenta 0, 5xx y 423; ningún 4xx más (409 incluido); no mira navigator.onLine; avisa a onReintento solo si reintenta.
 */
type Opciones = Record<string, unknown> & {
  endpoint: string
  retryDelays: number[]
  chunkSize: number
  metadata: Record<string, string>
  headers: Record<string, string>
  storeFingerprintForResuming: boolean
  onProgress: (enviados: number, total: number) => void
  onChunkComplete: (tamanioTrozo: number, aceptados: number, total: number) => void
  onSuccess: () => void
  onError: (error: unknown) => void
  onShouldRetry: (error: unknown, intento: number, opciones: unknown) => boolean
  onBeforeRequest: (req: { setHeader: (n: string, v: string) => void }) => void | Promise<void>
}
type Falso = { file: Blob; options: Opciones; start: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }

const { instancias, getSession } = vi.hoisted(() => ({
  instancias: [] as Falso[],
  getSession: vi.fn(),
}))

vi.mock('tus-js-client', () => {
  class Upload {
    start = vi.fn()
    abort = vi.fn(async () => {})
    file: Blob
    options: Opciones
    constructor(file: Blob, options: Opciones) {
      this.file = file
      this.options = options
      instancias.push(this as unknown as Falso)
    }
  }
  return { Upload, default: { Upload } }
})
vi.mock('@/shared/lib/supabase', () => ({ supabase: { auth: { getSession } } }))

const MIB = 1024 * 1024
const archivo = () => new File(['contenido'], 'guia.pdf', { type: '' })

function error(status: number | null, cuerpo = '') {
  return {
    message: `tus: unexpected response (${status})`,
    originalResponse: status === null ? null : { getStatus: () => status, getBody: () => cuerpo },
  }
}

function iniciar(opciones: Parameters<typeof subirReanudable>[4] = {}, file = archivo()) {
  const promesa = subirReanudable('talleres', '5/uuid.pdf', file, 'application/pdf', opciones)
  const upload = instancias[instancias.length - 1]
  return { promesa, upload, o: upload.options }
}

beforeEach(() => {
  vi.resetAllMocks()
  instancias.length = 0
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } }, error: null })
})

describe('subirReanudable: configuración de tus', () => {
  it('crea un solo Upload con el archivo, lo inicia y resuelve cuando tus informa el éxito', async () => {
    const file = archivo()
    const { promesa, upload, o } = iniciar({}, file)

    expect(instancias).toHaveLength(1)
    expect(upload.file).toBeInstanceOf(Blob)
    expect((upload.file as Blob).size).toBe(file.size)
    expect(upload.start).toHaveBeenCalledTimes(1)

    o.onSuccess()
    await expect(promesa).resolves.toBeUndefined()
  })

  it('apunta al endpoint resumable de Storage y manda los metadatos del objeto', () => {
    const { o } = iniciar()

    expect(o.endpoint).toMatch(/\/storage\/v1\/upload\/resumable$/)
    expect(o.metadata).toMatchObject({
      bucketName: 'talleres',
      objectName: '5/uuid.pdf',
      contentType: 'application/pdf',
      cacheControl: expect.any(String),
    })
  })

  it('manda x-upsert: false y la cabecera apikey, pero no fija Authorization en las cabeceras', () => {
    const { o } = iniciar()

    expect(o.headers['x-upsert']).toBe('false')
    expect(Object.keys(o.headers)).toContain('apikey')
    expect(Object.keys(o.headers).map((k) => k.toLowerCase())).not.toContain('authorization')
  })

  it('usa trozos de 6 MiB y no guarda la huella para retomar tras recargar', () => {
    const { o } = iniciar()

    expect(o.chunkSize).toBe(6 * MIB)
    expect(o.storeFingerprintForResuming).toBe(false)
  })

  it('los reintentos cubren unos 2 minutos en total', () => {
    const { o } = iniciar()

    const total = o.retryDelays.reduce((suma, ms) => suma + ms, 0)
    expect(total).toBeGreaterThanOrEqual(90_000)
    expect(total).toBeLessThanOrEqual(150_000)
  })
})

describe('subirReanudable: token vigente en cada petición (criterio 8)', () => {
  it('onBeforeRequest toma el access token actual de getSession() en cada llamada', async () => {
    const { o } = iniciar()
    const req1 = { setHeader: vi.fn() }
    const req2 = { setHeader: vi.fn() }

    await o.onBeforeRequest(req1)
    getSession.mockResolvedValue({ data: { session: { access_token: 'token-2' } }, error: null })
    await o.onBeforeRequest(req2)

    expect(req1.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer token-1')
    expect(req2.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer token-2')
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('con la sesión nula, onBeforeRequest lanza (tus lo trata como un corte) y no pone Authorization', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { o } = iniciar()
    const req = { setHeader: vi.fn() }

    await expect(Promise.resolve().then(() => o.onBeforeRequest(req))).rejects.toThrow()

    expect(req.setHeader).not.toHaveBeenCalled()
  })
})

describe('subirReanudable: progreso', () => {
  it('informa el porcentaje entero de bytes enviados sobre el total', () => {
    const onProgress = vi.fn()
    const { o } = iniciar({ onProgress })

    o.onProgress(250, 1000)
    o.onProgress(1000, 1000)

    expect(onProgress).toHaveBeenCalledWith(25)
    expect(onProgress).toHaveBeenLastCalledWith(100)
    for (const [valor] of onProgress.mock.calls) expect(Number.isInteger(valor)).toBe(true)
  })

  it('nunca retrocede: si tus informa menos bytes tras un corte, no baja', () => {
    const onProgress = vi.fn()
    const { o } = iniciar({ onProgress })

    o.onProgress(300, 1000)
    o.onProgress(600, 1000)
    o.onProgress(200, 1000)
    o.onProgress(250, 1000)

    const valores = onProgress.mock.calls.map(([v]) => v as number)
    expect(valores).toContain(60)
    expect(valores).not.toContain(20)
    expect(valores).not.toContain(25)
    expect(valores).toEqual([...valores].sort((a, b) => a - b))
  })

  it('onChunkComplete fija un piso confirmado: el progreso posterior no baja de ahí', () => {
    const onProgress = vi.fn()
    const { o } = iniciar({ onProgress })

    o.onChunkComplete(500, 500, 1000)
    o.onProgress(400, 1000)

    const valores = onProgress.mock.calls.map(([v]) => v as number)
    expect(valores.length).toBeGreaterThan(0)
    expect(Math.min(...valores)).toBeGreaterThanOrEqual(50)
  })
})

describe('subirReanudable: reintentos', () => {
  it('onShouldRetry del Upload reintenta un corte (status 0) y avisa con onReintento', () => {
    const onReintento = vi.fn()
    const { o } = iniciar({ onReintento })

    expect(o.onShouldRetry(error(null), 0, {})).toBe(true)
    expect(onReintento).toHaveBeenCalledTimes(1)
  })

  it('onShouldRetry del Upload no reintenta un 403 ni avisa', () => {
    const onReintento = vi.fn()
    const { o } = iniciar({ onReintento })

    expect(o.onShouldRetry(error(403), 0, {})).toBe(false)
    expect(onReintento).not.toHaveBeenCalled()
  })

  it('tras un error definitivo, un onShouldRetry tardío no llama a onReintento', async () => {
    const onReintento = vi.fn()
    const { promesa, o } = iniciar({ onReintento })

    o.onError(error(413, 'Maximum size exceeded'))
    await promesa.catch(() => {})
    o.onShouldRetry(error(null), 0, {})

    expect(onReintento).not.toHaveBeenCalled()
  })

  it('tras el éxito, un onShouldRetry tardío no llama a onReintento', async () => {
    const onReintento = vi.fn()
    const { promesa, o } = iniciar({ onReintento })

    o.onSuccess()
    await promesa
    o.onShouldRetry(error(null), 0, {})

    expect(onReintento).not.toHaveBeenCalled()
  })

  it('tras cancelar con el signal, un onShouldRetry tardío no llama a onReintento', async () => {
    const onReintento = vi.fn()
    const control = new AbortController()
    const { promesa, o } = iniciar({ onReintento, signal: control.signal })

    control.abort()
    await promesa.catch(() => {})
    o.onShouldRetry(error(null), 0, {})

    expect(onReintento).not.toHaveBeenCalled()
  })
})

describe('subirReanudable: errores', () => {
  it.each([
    [413, 'Maximum size exceeded', '413'],
    [415, 'mime type application/x-msdownload is not supported', '415'],
    [403, 'new row violates row-level security policy', '403'],
  ])('un %i definitivo rechaza con { statusCode: "%s" }', async (status, cuerpo, esperado) => {
    const { promesa, o } = iniciar()

    o.onError(error(status, cuerpo))

    await expect(promesa).rejects.toMatchObject({ statusCode: esperado })
  })

  it('un HTTP 400 con cuerpo JSON que trae statusCode usa ese (token vencido: 403)', async () => {
    const { promesa, o } = iniciar()

    o.onError(error(400, '{"statusCode":"403","code":"AccessDenied","error":"Unauthorized","message":"exp claim timestamp check failed"}'))

    await expect(promesa).rejects.toMatchObject({ statusCode: '403' })
  })

  it('un HTTP 400 con cuerpo que no es JSON rechaza con 400', async () => {
    const { promesa, o } = iniciar()

    o.onError(error(400, 'bad request'))

    await expect(promesa).rejects.toMatchObject({ statusCode: '400' })
  })

  it('reintentos agotados (5xx) rechaza con el status del último error', async () => {
    const { promesa, o } = iniciar()

    o.onError(error(503, 'unavailable'))

    await expect(promesa).rejects.toMatchObject({ statusCode: '503' })
  })

  it('ante un error definitivo borra el upload incompleto con abort(true)', async () => {
    const { promesa, upload, o } = iniciar()

    o.onError(error(413, 'Maximum size exceeded'))

    await expect(promesa).rejects.toBeDefined()
    expect(upload.abort).toHaveBeenCalledWith(true)
  })

  it('si abort(true) falla, el rechazo original se conserva y no queda un rechazo sin manejar', async () => {
    const { promesa, upload, o } = iniciar()
    upload.abort.mockRejectedValue(new Error('DELETE falló'))

    o.onError(error(503, 'unavailable'))

    await expect(promesa).rejects.toMatchObject({ statusCode: '503' })
    await new Promise((r) => setTimeout(r, 0))
  })
})

describe('subirReanudable: cancelación con signal', () => {
  it('al abortar el signal llama a abort(true) y rechaza con un AbortError', async () => {
    const control = new AbortController()
    const { promesa, upload } = iniciar({ signal: control.signal })

    control.abort()

    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
    expect(upload.abort).toHaveBeenCalledWith(true)
  })

  it('el AbortError se distingue de un rechazo del servidor (no trae statusCode)', async () => {
    const control = new AbortController()
    const { promesa } = iniciar({ signal: control.signal })

    control.abort()

    await expect(promesa).rejects.not.toHaveProperty('statusCode')
  })

  it('si abort(true) falla al cancelar, igual rechaza con AbortError y no deja un rechazo sin manejar', async () => {
    const control = new AbortController()
    const { promesa, upload } = iniciar({ signal: control.signal })
    upload.abort.mockRejectedValue(new Error('DELETE falló'))

    control.abort()

    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
    await new Promise((r) => setTimeout(r, 0))
  })

  it('con el signal ya abortado rechaza con AbortError sin iniciar la subida', async () => {
    const control = new AbortController()
    control.abort()

    const promesa = subirReanudable('talleres', '5/uuid.pdf', archivo(), 'application/pdf', { signal: control.signal })

    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
    for (const u of instancias) expect(u.start).not.toHaveBeenCalled()
  })
})

describe('onShouldRetry (pura)', () => {
  it.each([[0], [500], [502], [503], [504], [423]])('reintenta el status %i', (status) => {
    expect(onShouldRetry(error(status))).toBe(true)
  })

  it('reintenta cuando no hay respuesta (corte de red)', () => {
    expect(onShouldRetry(error(null))).toBe(true)
  })

  it.each([[400], [401], [403], [404], [409], [413], [415], [422], [429]])('no reintenta ningún 4xx (%i)', (status) => {
    expect(onShouldRetry(error(status))).toBe(false)
  })

  it.each([['503'], ['423'], ['500']])(
    'con un HTTP 400 cuyo cuerpo trae statusCode %s, reintenta y avisa (el código real gana)',
    (statusCode) => {
      const onReintento = vi.fn()

      expect(onShouldRetry(error(400, JSON.stringify({ statusCode })), onReintento)).toBe(true)
      expect(onReintento).toHaveBeenCalledTimes(1)
    },
  )

  it('con un HTTP 400 cuyo cuerpo trae statusCode numérico 503, reintenta', () => {
    expect(onShouldRetry(error(400, '{"statusCode":503}'))).toBe(true)
  })

  it.each([['{"statusCode":"403"}'], ['{"statusCode":"413"}'], ['bad request'], ['{"message":"x"}'], ['']])(
    'con un HTTP 400 y cuerpo %j (403, 413 o sin código) no reintenta',
    (cuerpo) => {
      const onReintento = vi.fn()

      expect(onShouldRetry(error(400, cuerpo), onReintento)).toBe(false)
      expect(onReintento).not.toHaveBeenCalled()
    },
  )

  it('no mira navigator.onLine: reintenta aunque el navegador diga que no hay conexión', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(onShouldRetry(error(null))).toBe(true)
    expect(onShouldRetry(error(0))).toBe(true)

    online.mockRestore()
  })

  it('llama a onReintento cuando reintenta y no cuando no', () => {
    const onReintento = vi.fn()

    expect(onShouldRetry(error(503), onReintento)).toBe(true)
    expect(onReintento).toHaveBeenCalledTimes(1)

    expect(onShouldRetry(error(413), onReintento)).toBe(false)
    expect(onShouldRetry(error(409), onReintento)).toBe(false)
    expect(onReintento).toHaveBeenCalledTimes(1)
  })
})
