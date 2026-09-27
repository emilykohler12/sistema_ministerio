import { Outlet } from 'react-router-dom'
import { SkipLink } from '@/shared/components/ui/SkipLink'
import { PublicFooter } from './PublicFooter'
import { PublicHeader } from './PublicHeader'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SkipLink />
      <PublicHeader />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  )
}
