import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'

const ROLE_LABELS: Record<string, string> = {
  company_owner: 'Company Owner',
  sales_manager: 'Sales Manager',
  project_coordinator: 'Project Coordinator',
  import_manager: 'Import Manager',
  installation_engineer: 'Installation & Service Engineer',
  supplier: 'Supplier',
  customer: 'Customer',
}

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              BLI
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">{title}</p>
              {user && <p className="text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && <span className="hidden text-sm text-slate-600 sm:inline">{user.name}</span>}
            <button
              type="button"
              onClick={logout}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
