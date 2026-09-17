import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { ManufacturingMilestone } from '../lib/types'

/** Stage 3 evidence: the manufacturing checklist — every item must be `done`. */
export function MilestonesSection({ orderId, orderStageId }: { orderId: number; orderStageId: number }) {
  const { user } = useAuth()
  const [milestones, setMilestones] = useState<ManufacturingMilestone[] | null>(null)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEdit = user?.role === 'project_coordinator'

  async function reload() {
    setMilestones(await api.get<ManufacturingMilestone[]>(`/orders/${orderId}/stages/3/milestones`))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load milestones.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderStageId])

  async function handleCreate() {
    if (name.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/stages/3/milestones`, { name, sequence: (milestones?.length ?? 0) + 1 })
      setName('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the milestone.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleDone(milestone: ManufacturingMilestone) {
    setError(null)
    try {
      await api.patch(`/milestones/${milestone.id}`, { status: milestone.status === 'done' ? 'pending' : 'done' })
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the milestone.')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Manufacturing checklist</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-3 space-y-1.5">
        {milestones?.map((m) => (
          <label key={m.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={m.status === 'done'}
              onChange={() => canEdit && toggleDone(m)}
              disabled={!canEdit}
              className="h-4 w-4"
            />
            <span className={m.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}>{m.name}</span>
          </label>
        ))}
        {milestones?.length === 0 && <p className="text-sm text-slate-400">No milestones yet — this stage needs at least one.</p>}
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Add a milestone…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || name.trim() === ''}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
