// Utilidades para testear hooks y componentes que dependen de React Query o del router.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

function crearQueryClient() {
  // Un cliente nuevo por test: sin reintentos ni caché compartida entre tests.
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/** Wrapper para `renderHook` de hooks que usan React Query. */
export function crearWrapperQuery() {
  const client = crearQueryClient()
  return function WrapperQuery({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/** Renderiza un componente con React Query y router en memoria. */
export function renderConProviders(ui: ReactElement, { ruta = '/' }: { ruta?: string } = {}) {
  const client = crearQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
