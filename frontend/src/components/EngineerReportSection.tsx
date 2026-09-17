import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { EngineerReport, EngineerReportType } from '../lib/types'

/** Stage 9 (installation) / stage 12 (handover_readiness) evidence — the Engineer's own report. */
export function EngineerReportSection({
  orderId,
  stageId,
  type,
  title,
}: {
  orderId: number
  stageId: number
  type: EngineerReportType
  title: string
}) {
  const { user } = useAuth()
  const [reports, setReports] = useState<EngineerReport[] | null>(null)
  const [completionStatus, setCompletionStatus] = useState<'complete' | 'incomplete'>('complete')
  const [outstandingIssues, setOutstandingIssues] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = user?.role === 'installation_engineer'

  async function reload() {
    const all = await api.get<EngineerReport[]>(`/orders/${orderId}/stages/${stageId}/engineer-reports`)
    setReports(all.filter((r) => r.type === type))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load engineer reports.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, type])

  const latest = reports?.[reports.length - 1] ?? null

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/stages/${stageId}/engineer-reports`, {
        type,
        completion_status: completionStatus,
        outstanding_issues: outstandingIssues || undefined,
        notes: notes || undefined,
      })
      setOutstandingIssues('')
      setNotes('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the report.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {latest && (
        <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <p className="font-medium text-slate-900">
            Latest: {latest.completion_status}
            {latest.outstanding_issues && <span className="font-normal text-amber-700"> — outstanding: {latest.outstanding_issues}</span>}
          </p>
          {latest.notes && <p className="mt-1 text-slate-600">{latest.notes}</p>}
        </div>
      )}
      {reports?.length === 0 && <p className="mb-3 text-sm text-slate-400">No report submitted yet.</p>}

      {canSubmit && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={completionStatus}
              onChange={(e) => setCompletionStatus(e.target.value as 'complete' | 'incomplete')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
            </select>
            <input
              type="text"
              placeholder="Outstanding issues (if any)"
              value={outstandingIssues}
              onChange={(e) => setOutstandingIssues(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Submit report
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
