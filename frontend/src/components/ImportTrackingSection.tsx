import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { CustomerImportTracking } from '../lib/types'

const REQUIRED_STATUS: Record<number, string> = { 7: 'cleared', 8: 'delivered' }

/**
 * Stages 7 (import clearance)/8 (delivery) evidence — executed by the
 * customer's own import team, the PC just records what's reported
 * (docs/ARCHITECTURE.md §8). Completing stage 7 needs latest_status
 * 'cleared', stage 8 needs 'delivered' — the value itself isn't
 * restricted here (BLI reports whatever actually happened), that gate
 * lives in StageCompletionEvaluator server-side.
 */
export function ImportTrackingSection({ orderId, stageId }: { orderId: number; stageId: number }) {
  const { user } = useAuth()
  const [tracking, setTracking] = useState<CustomerImportTracking | null | undefined>(undefined)
  const [contactName, setContactName] = useState('')
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEdit = user?.role === 'project_coordinator'
  const requiredStatus = REQUIRED_STATUS[stageId]

  async function reload() {
    setTracking(await api.get<CustomerImportTracking | null>(`/orders/${orderId}/stages/${stageId}/import-tracking`))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load import tracking.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, stageId])

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/stages/${stageId}/import-tracking`, {
        customer_contact_name: contactName || undefined,
        latest_status: status || undefined,
      })
      setContactName('')
      setStatus('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the tracking record.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateStatus() {
    if (!tracking || status.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.patch(`/import-tracking/${tracking.id}`, { latest_status: status, note: note || undefined })
      setStatus('')
      setNote('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the status.')
    } finally {
      setSubmitting(false)
    }
  }

  if (tracking === undefined) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Customer import tracking</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tracking ? (
        <>
          <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
            <p className="font-medium text-slate-900">Latest status: {tracking.latest_status ?? '—'}</p>
            {tracking.customer_contact_name && <p className="text-slate-600">Contact: {tracking.customer_contact_name}</p>}
            {requiredStatus && tracking.latest_status !== requiredStatus && (
              <p className="mt-1 text-xs text-amber-700">Stage completes once this reaches &quot;{requiredStatus}&quot;.</p>
            )}
          </div>
          {tracking.history && tracking.history.length > 0 && (
            <div className="mb-3 space-y-1">
              {tracking.history.map((h) => (
                <p key={h.id} className="text-xs text-slate-500">
                  {new Date(h.reported_at).toLocaleString()} — {h.status}
                  {h.note && `: ${h.note}`}
                </p>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder={`New status${requiredStatus ? ` (e.g. ${requiredStatus})` : ''}`}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-48"
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleUpdateStatus}
                disabled={submitting || status.trim() === ''}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Update
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-400">No tracking record yet.</p>
          {canEdit && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="Customer contact name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Initial status (optional)"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-48"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={submitting}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Start tracking
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
