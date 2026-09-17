import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Requirement } from '../lib/types'

/** Stage 1 evidence: requirements, PC-authored, SM/Owner-approved. */
export function RequirementsSection({ orderId }: { orderId: number }) {
  const { user } = useAuth()
  const [requirements, setRequirements] = useState<Requirement[] | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCreate = user?.role === 'project_coordinator'
  const canApprove = user && ['sales_manager', 'company_owner'].includes(user.role)

  async function reload() {
    setRequirements(await api.get<Requirement[]>(`/orders/${orderId}/requirements`))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load requirements.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function handleCreate() {
    if (description.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/requirements`, { description })
      setDescription('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the requirement.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove(id: number) {
    setError(null)
    try {
      await api.patch(`/requirements/${id}/approve`)
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not approve the requirement.')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Requirements</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-3 space-y-1.5">
        {requirements?.map((req) => (
          <div key={req.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-700">{req.description}</span>
            {req.approved_at ? (
              <span className="shrink-0 text-xs font-medium text-emerald-700">Approved</span>
            ) : canApprove ? (
              <button type="button" onClick={() => handleApprove(req.id)} className="shrink-0 text-brand-600 hover:underline">
                Approve
              </button>
            ) : (
              <span className="shrink-0 text-xs font-medium text-amber-700">Pending approval</span>
            )}
          </div>
        ))}
        {requirements?.length === 0 && <p className="text-sm text-slate-400">No requirements captured yet.</p>}
      </div>

      {canCreate && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Describe a requirement…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || description.trim() === ''}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
