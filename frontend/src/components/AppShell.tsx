import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Sidebar } from './Sidebar'

export function AppShell({ title, children, breadcrumbs }: { title: string; children: ReactNode; breadcrumbs?: { label: string; to?: string }[] }) {
  const { user } = useAuth()

  return (
    <div className="min-h-screen">
      <Sidebar />

      {/* Main content area — offset by sidebar width */}
      <div className="lg:pl-20 xl:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 pl-12 lg:pl-0">
              <div>
                {breadcrumbs && breadcrumbs.length > 0 && (
                  <nav className="mb-0.5 flex items-center gap-1 text-xs text-slate-400">
                    {breadcrumbs.map((crumb, i) => (
                      <span key={crumb.label} className="flex items-center gap-1">
                        {i > 0 && <span>/</span>}
                        {crumb.to ? (
                          <Link to={crumb.to} className="hover:text-brand-600">{crumb.label}</Link>
                        ) : (
                          <span className="text-slate-500">{crumb.label}</span>
                        )}
                      </span>
                    ))}
                  </nav>
                )}
                <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" title="Search">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
