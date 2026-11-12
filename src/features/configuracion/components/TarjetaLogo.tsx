import { useIsMutating } from '@tanstack/react-query'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog'
import { validarLogo } from '../archivos'
import { mensajeDeErrorLogo } from '../errores'
import { useConfiguracion } from '../hooks/useConfiguracion'
import { useCambiarLogo, useQuitarLogo } from '../hooks/useLogo'
import { LogoInstitucional } from './LogoInstitucional'

/**
 * Bloque del logo de la pantalla de configuración: vista previa, «Cambiar logo» y «Quitar logo». Va fuera del
 * `<form>` de la página y es independiente de «Guardar». Todas las mutaciones de la configuración comparten la
 * `mutationKey` `['configuracion', …]`: mientras alguna esté pendiente (el guardado o el logo), los botones esperan,
 * para que la respuesta tardía de una no pise la caché con una ruta ya borrada.
 */
export function TarjetaLogo() {
  const { data } = useConfiguracion()
  const cambiarLogo = useCambiarLogo()
  const quitarLogo = useQuitarLogo()
  const ocupado = useIsMutating({ mutationKey: ['configuracion'] }) > 0
  const [mensaje, setMensaje] = useState('')
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const botonCambiarRef = useRef<HTMLButtonElement>(null)
  const devolverFoco = useRef(false)

  // Al terminar un cambio o un «Quitar» (con éxito o con error) el botón que tenía el foco quedó deshabilitado o ya no
  // existe: el foco vuelve a «Cambiar logo», que es el que sigue disponible. Un solo efecto, sin dependencias: corre
  // en cada render y actúa cuando la operación terminó (`devolverFoco`) y el botón ya no está deshabilitado. No se ata
  // a la transición de `isPending`: con una respuesta inmediata React no llega a renderizar el estado pendiente.
  useEffect(() => {
    if (devolverFoco.current && !ocupado) {
      devolverFoco.current = false
      botonCambiarRef.current?.focus()
    }
  })

  if (!data) return null

  async function onArchivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Se vacía para poder volver a elegir el mismo archivo (p. ej. tras un error).
    e.target.value = ''
    if (!file) return
    const motivo = validarLogo(file)
    if (motivo) {
      setMensaje(motivo)
      return
    }
    setMensaje('')
    try {
      await cambiarLogo.mutateAsync({ file, anterior: data?.logo_ruta ?? null })
      setMensaje('Logo actualizado')
    } catch (error) {
      setMensaje(mensajeDeErrorLogo(error))
    } finally {
      devolverFoco.current = true
    }
  }

  async function onQuitar() {
    if (!data?.logo_ruta) return
    setMensaje('')
    try {
      await quitarLogo.mutateAsync({ anterior: data.logo_ruta })
      setMensaje('Logo quitado')
    } catch (error) {
      setMensaje(mensajeDeErrorLogo(error))
    } finally {
      devolverFoco.current = true
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold text-primary-700">Logo institucional</h2>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <LogoInstitucional className="h-16 w-16" alt="Logo actual de la institución" claseFallback="text-lg" />
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-500">Recomendado: una imagen cuadrada PNG, JPG o WebP de hasta 2 MB.</p>
          <div className="flex flex-wrap gap-3">
            <Button
              ref={botonCambiarRef}
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={() => inputRef.current?.click()}
            >
              Cambiar logo
            </Button>
            {data.logo_ruta && (
              <Button type="button" variant="outline" disabled={ocupado} onClick={() => setConfirmandoQuitar(true)}>
                Quitar logo
              </Button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            tabIndex={-1}
            aria-label="Archivo del logo"
            onChange={(e) => void onArchivo(e)}
          />
          {/* Siempre montado: una región que aparece ya con texto no se anuncia de forma confiable. */}
          <p role="status" className="text-sm font-medium text-gray-700">
            {mensaje}
          </p>
        </div>
      </div>
      <ConfirmDialog
        open={confirmandoQuitar}
        onClose={() => setConfirmandoQuitar(false)}
        onConfirm={() => void onQuitar()}
        title="¿Quitar el logo?"
        description="El sitio vuelve a mostrar las iniciales de la institución. Esta acción no se puede deshacer."
        confirmLabel="Quitar logo"
      />
    </Card>
  )
}
