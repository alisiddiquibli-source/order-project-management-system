import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { DocumentRecord, UrsExemption } from '../lib/types'

/**
 * Stage 1 requires a URS (User Requirement Specification) document on
 * file (StageCompletionEvaluator) — this panel shows whether one exists,
 * and if not, lets the Owner (only — never Sales Manager/PC) approve a
 * one-time exemption for this order, e.g. when the customer genuinely
 * has none to give.
 */
export function UrsExemptionPanel({
  orderId,
  orderStageId,
  refreshKey,
}: {
  orderId: number
  orderStageId: number
  /** Bumped by the sibling URS DocumentsSection on upload — separate fetches, no shared state otherwise. */
  refreshKey?: number
}) {
  const { user } = useAuth()
  const [hasUrs, setHasUrs] = useState<boolean | null>(null)
  const [exemption, setExemption] = useState<UrsExemption | null | undefined>(undefined)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canApproveExemption = user?.role === 'company_owner'

  async function reload() {
    const [documents, ursExemption] = await Promise.all([
      api.get<DocumentRecord[]>(`/orders/${orderId}/documents`),
      api.get<UrsExemption | null>(`/orders/${orderId}/urs-exemption`),
    ])
    setHasUrs(documents.some((d) => d.order_stage_id === orderStageId && d.type === 'URS'))
    setExemption(ursExemption)
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load URS status.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, orderStageId, refreshKey])

  async function handleApprove() {
    if (reason.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/urs-exemption`, { reason })
      setReason('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not approve the exemption.')
    } finally {
      setSubmitting(false)
    }
  }

  if (hasUrs === null) return null

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">URS status</h3>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {hasUrs ? (
        <p className="text-sm font-medium text-emerald-700">URS document on file.</p>
      ) : exemption ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">No URS document — exemption approved.</p>
          <p className="mt-1">{exemption.reason}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-amber-700">
            No URS document uploaded yet — required before this stage can be marked complete, unless the Owner
            approves an exemption.
          </p>
          {canApproveExemption && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="Reason the customer has no URS (required)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleApprove}
                disabled={submitting || reason.trim() === ''}
                className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Approve exemption
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
