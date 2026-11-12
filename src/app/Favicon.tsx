import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLogo } from '@/features/configuracion/hooks/useLogo'

const POR_DEFECTO = '/favicon.svg'

function FaviconActual() {
  const { isPending, url } = useLogo()

  useEffect(() => {
    if (isPending) return
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.setAttribute('href', url ?? POR_DEFECTO)
  }, [isPending, url])

  return null
}

/**
 * Pone el logo como favicon: cambia solo el `href` del `<link rel="icon">` (lo crea si falta). Sin logo, o mientras la
 * configuración carga o si falla, queda el favicon estático. No renderiza nada.
 *
 * Vive fuera de las pantallas, así que sobrevive a `queryClient.clear()` (AuthContext lo llama al iniciar o cerrar
 * sesión): el observador quedaría mirando una query que ya no está en la caché y dejaría de seguir al logo. Cuando se
 * quita la query de la configuración, se vuelve a montar el observador.
 */
export function Favicon() {
  const queryClient = useQueryClient()
  const [generacion, setGeneracion] = useState(0)

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((evento) => {
        if (evento.type === 'removed' && evento.query.queryKey[0] === 'configuracion') setGeneracion((g) => g + 1)
      }),
    [queryClient],
  )

  return <FaviconActual key={generacion} />
}
