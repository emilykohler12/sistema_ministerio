import { Upload } from 'tus-js-client'
import { supabase } from '@/shared/lib/supabase'

const MIB = 1024 * 1024

/**
 * Storage (S3) exige partes de 6 MiB. Reintentos de ~2 minutos en total (129 s): cubren un corte de red y no se
 * agotan con la primera falla. La librería reinicia el contador cuando un reintento avanzó.
 */
const TAMANIO_TROZO = 6 * MIB
const ESPERAS_DE_REINTENTO = [0, 1000, 3000, 5000, 10_000, 20_000, 30_000, 60_000]

export type OpcionesSubida = {
  /** Porcentaje entero de 0 a 100 que nunca retrocede. */
  onProgress?: (porcentaje: number) => void
  /** Se llama cada vez que se decide reintentar tras un corte o una falla del servidor. */
  onReintento?: () => void
  /** Al abortarlo se borra el upload en el servidor y la promesa rechaza con un `AbortError`. */
  signal?: AbortSignal
}

type ErrorDeTus = { originalResponse?: { getStatus(): number; getBody(): string } | null; message?: string }

/**
 * Decide si tus reintenta: cortes (sin respuesta, status 0), 5xx y 423. Todo 4xx es definitivo, incluido el 409 (el
 * objeto ya existe). No mira `navigator.onLine`: el valor por defecto de la librería no reintenta sin conexión.
 */
export function onShouldRetry(error: ErrorDeTus, onReintento?: () => void): boolean {
  // El mismo status que termina rechazando la promesa: con un HTTP 400 gana el `statusCode` del cuerpo JSON.
  const status = Number(statusDelError(error))
  const reintentar = status === 0 || status >= 500 || status === 423
  if (reintentar) onReintento?.()
  return reintentar
}

/**
 * Status del rechazo. Con un HTTP 400 el código real viene en el cuerpo JSON (`statusCode`, p. ej. un token vencido es
 * un 403 dentro de un 400); con texto plano (413, 415, 403) el status HTTP ya es el real.
 */
function statusDelError(error: ErrorDeTus): string {
  const respuesta = error.originalResponse
  const status = respuesta?.getStatus() ?? 0
  if (status === 400) {
    try {
      const { statusCode } = JSON.parse(respuesta?.getBody() ?? '') as { statusCode?: unknown }
      if (typeof statusCode === 'string' || typeof statusCode === 'number') return String(statusCode)
    } catch {
      // Cuerpo que no es JSON: vale el 400.
    }
  }
  return String(status)
}

/** Borra el upload incompleto en el servidor (mejor esfuerzo): no es un objeto, así que no queda nada que avisar. */
function descartar(upload: Upload): void {
  try {
    void Promise.resolve(upload.abort(true)).catch(() => {})
  } catch {
    // Sin red: el upload queda hasta que el servidor lo venza.
  }
}

function cancelado(): DOMException {
  return new DOMException('Subida cancelada', 'AbortError')
}

/**
 * Sube un objeto nuevo por TUS (nunca `upsert`: cada subida usa una ruta nueva): progreso real, reintentos que retoman
 * desde el último trozo confirmado y cancelación con `signal`. Rechaza con `{ statusCode }` (lo que entiende
 * `codigosDeError`) o con un `AbortError`. El MIME viaja en los metadatos; el bucket valida contra ese tipo.
 */
export function subirReanudable(
  bucket: string,
  ruta: string,
  file: Blob,
  mime: string,
  { onProgress, onReintento, signal }: OpcionesSubida = {},
): Promise<void> {
  return new Promise<void>((resolver, rechazar) => {
    if (signal?.aborted) {
      rechazar(cancelado())
      return
    }

    // `onProgress` de tus cuenta bytes escritos al socket y baja tras un corte: se muestra el máximo.
    let porcentaje = 0
    function avanzar(enviados: number, total: number) {
      if (total > 0) porcentaje = Math.max(porcentaje, Math.floor((enviados * 100) / total))
      onProgress?.(porcentaje)
    }

    // Pasa a false al terminar, fallar o cancelar: un `onShouldRetry` tardío de tus no debe avisar de un reintento.
    let vigente = true

    function alCancelar() {
      vigente = false
      descartar(upload)
      rechazar(cancelado())
    }

    const upload = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: ESPERAS_DE_REINTENTO,
      chunkSize: TAMANIO_TROZO,
      storeFingerprintForResuming: false,
      metadata: { bucketName: bucket, objectName: ruta, contentType: mime, cacheControl: '3600' },
      headers: { 'x-upsert': 'false', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '' },
      // El token se toma en cada petición (incluidos los reintentos): una subida puede durar más que el access token.
      // Sin sesión lanza, y tus lo trata como un corte (se reintenta y vuelve a pedir el token).
      onBeforeRequest: async (req) => {
        const { data, error } = await supabase.auth.getSession()
        if (error || !data.session) throw new Error('Sin sesión para subir el archivo')
        req.setHeader('Authorization', `Bearer ${data.session.access_token}`)
      },
      onShouldRetry: (error) => onShouldRetry(error, vigente ? onReintento : undefined),
      onProgress: avanzar,
      onChunkComplete: (_trozo, aceptados, total) => avanzar(aceptados, total),
      onSuccess: () => {
        vigente = false
        signal?.removeEventListener('abort', alCancelar)
        resolver()
      },
      onError: (error) => {
        vigente = false
        signal?.removeEventListener('abort', alCancelar)
        descartar(upload)
        rechazar({ statusCode: statusDelError(error as ErrorDeTus), message: error.message })
      },
    })

    signal?.addEventListener('abort', alCancelar, { once: true })
    upload.start()
  })
}
