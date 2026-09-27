import { Menu } from 'lucide-react'

export function AdminHeader({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-gray-200 bg-primary-900 px-4 py-3 text-white lg:hidden">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menú"
        className="rounded-md p-1.5 hover:bg-primary-800"
      >
        <Menu className="h-6 w-6" />
      </button>
      <h1 className="text-sm font-semibold">{title}</h1>
    </header>
  )
}
