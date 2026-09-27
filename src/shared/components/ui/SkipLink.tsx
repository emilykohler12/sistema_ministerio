export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary-800 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      Saltar al contenido principal
    </a>
  )
}
