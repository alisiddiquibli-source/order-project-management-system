import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Project, User } from '../lib/types'

/**
 * Each project has exactly one Customer login, but until now only the
 * Owner could create or reset it, from a separate global admin page that
 * Sales Manager/PC can't even see — even though PC is the one who needs
 * the customer logged in to record SAT/training/handover acceptances.
 * Backend enforces the same narrow exception this renders for: SM/PC may
 * only touch a Customer login on a project they're actually assigned to
 * (POST /api/users, POST /api/users/{id}/reset-password).
 */
export function CustomerLoginPanel({ projectId }: { projectId: number }) {
  const { user } = useAuth()
  const canManage = user && ['company_owner', 'sales_manager', 'project_coordinator'].includes(user.role)
  // Reassigning a customer to a different project is narrower than
  // create/reset above — matches the backend's own gate on PATCH
  // /api/users/{id} (Owner and Sales Manager only).
  const canReassign = user && ['company_owner', 'sales_manager'].includes(user.role)

  const [customer, setCustomer] = useState<User | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [reassignTo, setReassignTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function reload() {
    const results = await api.get<User[]>(`/users?role=customer&scope_project_id=${projectId}`)
    setCustomer(results[0] ?? null)
  }

  useEffect(() => {
    if (!canManage) return
    reload().catch(() => setError('Could not load the customer login for this project.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, projectId])

  useEffect(() => {
    if (!canReassign) return
    api.get<Project[]>('/projects').then(setProjects).catch(() => {})
  }, [canReassign])

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      const result = await api.post<{ user: User; temporary_password: string }>('/users', {
        name,
        email,
        role: 'customer',
        scope_project_id: projectId,
      })
      setRevealedPassword(result.temporary_password)
      setName('')
      setEmail('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the customer login.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword() {
    if (!customer) return
    setError(null)
    try {
      const result = await api.post<{ temporary_password: string }>(`/users/${customer.id}/reset-password`)
      setRevealedPassword(result.temporary_password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset the password.')
    }
  }

  async function handleReassign() {
    if (!customer || !reassignTo) return
    setSubmitting(true)
    setError(null)
    try {
      await api.patch(`/users/${customer.id}`, { scope_project_id: Number(reassignTo) })
      setReassignTo('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reassign the project.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canManage) return null

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Customer login</h2>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {revealedPassword && (
        <div className="mb-3 flex items-center justify-between gap-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>
            Temporary password: <code className="rounded bg-amber-100 px-2 py-0.5 font-mono">{revealedPassword}</code>
            {' '}— share this with the customer now, e.g. for SAT approval. It won't be shown again.
          </p>
          <button type="button" onClick={() => setRevealedPassword(null)} className="shrink-0 text-amber-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {customer === undefined && <p className="text-sm text-slate-400">Loading…</p>}

      {customer === null && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Customer contact name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-48"
          />
          <input
            type="email"
            placeholder="Customer email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || !name || !email}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Create login
          </button>
        </div>
      )}

      {customer && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-800">{customer.name}</p>
              <p className="text-xs text-slate-500">{customer.email}</p>
              <p className="text-xs text-slate-400">
                {customer.status === 'active'
                  ? 'Active — can log in to record SAT, training, and handover acceptances.'
                  : 'Inactive.'}
              </p>
            </div>
            <button type="button" onClick={handleResetPassword} className="shrink-0 text-sm font-medium text-brand-600 hover:underline">
              Reset password
            </button>
          </div>

          {canReassign && (
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
              <span className="text-xs text-slate-400">Wrong project? Move this login to:</span>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Which project?</option>
                {projects?.filter((p) => p.id !== projectId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} · {p.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleReassign}
                disabled={submitting || !reassignTo}
                className="rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Move
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
