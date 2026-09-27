import { lazy, type ReactNode, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { PublicLayout } from '@/shared/components/layout/PublicLayout'
import { Skeleton } from '@/shared/components/ui/Skeleton'
import { HomePage } from '@/pages/public/HomePage'
import { TalleresCatalogoPage } from '@/pages/public/TalleresCatalogoPage'
import { TallerDetallePage } from '@/pages/public/TallerDetallePage'
import { NormativasPublicPage } from '@/pages/public/NormativasPublicPage'
import { ContactoPage } from '@/pages/public/ContactoPage'
import { LoginPage } from '@/pages/admin/LoginPage'

const AdminLayout = lazy(() =>
  import('@/shared/components/layout/AdminLayout').then((m) => ({ default: m.AdminLayout })),
)
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const NivelesPage = lazy(() =>
  import('@/pages/admin/talleres/NivelesPage').then((m) => ({ default: m.NivelesPage })),
)
const CategoriasPage = lazy(() =>
  import('@/pages/admin/talleres/CategoriasPage').then((m) => ({ default: m.CategoriasPage })),
)
const CategoriaFormPage = lazy(() =>
  import('@/pages/admin/talleres/CategoriaFormPage').then((m) => ({ default: m.CategoriaFormPage })),
)
const TalleresListPage = lazy(() =>
  import('@/pages/admin/talleres/TalleresListPage').then((m) => ({ default: m.TalleresListPage })),
)
const TallerFormPage = lazy(() =>
  import('@/pages/admin/talleres/TallerFormPage').then((m) => ({ default: m.TallerFormPage })),
)
const NormativasAdminPage = lazy(() =>
  import('@/pages/admin/normativas/NormativasAdminPage').then((m) => ({ default: m.NormativasAdminPage })),
)
const NormativaFormPage = lazy(() =>
  import('@/pages/admin/normativas/NormativaFormPage').then((m) => ({ default: m.NormativaFormPage })),
)
const ConfiguracionPage = lazy(() =>
  import('@/pages/admin/ConfiguracionPage').then((m) => ({ default: m.ConfiguracionPage })),
)

function AdminFallback() {
  return (
    <div className="p-8">
      <Skeleton className="h-8 w-48" />
    </div>
  )
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<AdminFallback />}>{element}</Suspense>
}

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/talleres', element: <TalleresCatalogoPage /> },
      { path: '/talleres/:id', element: <TallerDetallePage /> },
      { path: '/normativas', element: <NormativasPublicPage /> },
      { path: '/contacto', element: <ContactoPage /> },
    ],
  },
  { path: '/admin/login', element: <LoginPage /> },
  {
    path: '/admin',
    element: withSuspense(<AdminLayout />),
    children: [
      { index: true, element: <DashboardPage />, handle: { title: 'Dashboard' } },
      { path: 'talleres', element: <NivelesPage />, handle: { title: 'Talleres' } },
      { path: 'talleres/:nivel', element: <CategoriasPage />, handle: { title: 'Talleres' } },
      {
        path: 'talleres/:nivel/nueva-categoria',
        element: <CategoriaFormPage />,
        handle: { title: 'Nueva categoría' },
      },
      {
        path: 'talleres/:nivel/:categoriaId',
        element: <TalleresListPage />,
        handle: { title: 'Talleres' },
      },
      {
        path: 'talleres/:nivel/:categoriaId/nuevo',
        element: <TallerFormPage />,
        handle: { title: 'Nuevo taller' },
      },
      {
        path: 'talleres/:nivel/:categoriaId/:tallerId/editar',
        element: <TallerFormPage />,
        handle: { title: 'Editar taller' },
      },
      { path: 'normativas', element: <NormativasAdminPage />, handle: { title: 'Normativas' } },
      { path: 'normativas/nueva', element: <NormativaFormPage />, handle: { title: 'Nueva normativa' } },
      { path: 'configuracion', element: <ConfiguracionPage />, handle: { title: 'Configuración' } },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
