import { useEffect, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { ApiError, api } from '../lib/api'
import type { Role, User } from '../lib/types'

const ROLE_LABELS: Record<Role, string> = {
  company_owner: 'Company Owner',
  sales_manager: 'Sales Manager',
  project_coordinator: 'Project Coordinator',
  import_manager: 'Import Manager',
  installation_engineer: 'Installation & Service Engineer',
  supplier: 'Supplier',
  customer: 'Customer',
}

/**
 * Account administration (docs/ARCHITECTURE.md §7.1) — Company Owner
 * only: create/deactivate logins, reset passwords, role assignments.
 * A created account's or a reset's temporary password is shown exactly
 * once, right here — it's never retrievable again after this response,
 * so the Owner has to actually hand it to the person before navigating away.
 */
export function UserManagementPage() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealedPassword, setRevealedPassword] = useState<{ email: string; password: string } | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('project_coordinator')
  const [submitting, setSubmitting] = useState(false)

  async function reload() {
    setUsers(await api.get<User[]>('/users'))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load users.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      const result = await api.post<{ user: User; temporary_password: string }>('/users', { name, email, role })
      setRevealedPassword({ email: result.user.email, password: result.temporary_password })
      setName('')
      setEmail('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the user.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRoleChange(user: User, newRole: Role) {
    setError(null)
    try {
      await api.patch(`/users/${user.id}`, { role: newRole })
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the role.')
    }
  }

  async function handleToggleStatus(user: User) {
    setError(null)
    try {
      await api.patch(`/users/${user.id}`, { status: user.status === 'active' ? 'inactive' : 'active' })
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the status.')
    }
  }

  async function handleResetPassword(user: User) {
    setError(null)
    try {
      const result = await api.post<{ temporary_password: string }>(`/users/${user.id}/reset-password`)
      setRevealedPassword({ email: user.email, password: result.temporary_password })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset the password.')
    }
  }

  return (
    <AppShell title="Manage users">
      {error && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {revealedPassword && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>
            Temporary password for <strong>{revealedPassword.email}</strong>:{' '}
            <code className="rounded bg-amber-100 px-2 py-0.5 font-mono">{revealedPassword.password}</code>
            {' '}— share this with them now. It won't be shown again.
          </p>
          <button type="button" onClick={() => setRevealedPassword(null)} className="shrink-0 text-amber-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Create a login</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-48"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || !name || !email}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Create
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Internal roles (everyone except Supplier/Customer) need a @businesslinks-pk.com email address.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users?.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-2 font-medium text-slate-900">{user.name}</td>
                <td className="px-4 py-2 text-slate-600">{user.email}</td>
                <td className="px-4 py-2">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user, e.target.value as Role)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-3">
                    <button type="button" onClick={() => handleToggleStatus(user)} className="text-xs font-medium text-brand-600 hover:underline">
                      {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button type="button" onClick={() => handleResetPassword(user)} className="text-xs font-medium text-brand-600 hover:underline">
                      Reset password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users?.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No users yet.</p>}
      </div>
    </AppShell>
  )
}
