import { useState } from 'react'
import { ApiError, api } from '../lib/api'
import type { AiReport } from '../lib/types'

const TYPE_LABELS: Record<string, string> = {
  order_risk_advisory: 'Risk advisory',
  project_status_report: 'Status report',
  portfolio_advisory: 'Portfolio advisory',
  follow_up_draft: 'Follow-up draft',
  daily_digest: 'Daily digest',
}

/**
 * Shared list + generate button for AI advisory (docs/ARCHITECTURE.md
 * §10) — used at order, project, and portfolio scope. The parent owns
 * fetching (each scope hits a different endpoint) and passes the already-
 * scoped list plus a generate callback; this only renders it and drives
 * the acknowledge/dismiss/action lifecycle, which is the same
 * `PATCH /api/ai-reports/{id}` regardless of scope.
 *
 * Advisory only — there is deliberately no action here that posts a
 * comment, changes a stage, or does anything besides recording what a
 * human decided to do with the AI's output.
 */
export function AiReportsPanel({
  title,
  reports,
  canGenerate,
  generateLabel,
  onGenerate,
  onChanged,
}: {
  title: string
  reports: AiReport[] | null
  canGenerate: boolean
  generateLabel: string
  onGenerate: () => Promise<void>
  onChanged: () => Promise<void>
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      await onGenerate()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate a report.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {canGenerate && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {generating ? 'Generating…' : generateLabel}
          </button>
        )}
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        {reports?.map((report) => (
          <AiReportRow key={report.id} report={report} onChanged={onChanged} />
        ))}
        {reports?.length === 0 && <p className="text-sm text-slate-400">No AI reports yet.</p>}
      </div>
    </div>
  )
}

function AiReportRow({ report, onChanged }: { report: AiReport; onChanged: () => Promise<void> }) {
  const [actionNotes, setActionNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function updateStatus(status: string) {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/ai-reports/${report.id}`, { status, action_notes: actionNotes || undefined })
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{TYPE_LABELS[report.type] ?? report.type}</span>
        <span>
          {report.provider} · {new Date(report.created_at).toLocaleString()}
        </span>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">{report.response}</pre>

      {report.action_notes && (
        <p className="mt-2 rounded-md bg-white px-2 py-1.5 text-sm text-slate-600">
          <span className="font-medium">Note:</span> {report.action_notes}
        </p>
      )}

      {report.status === 'new' ? (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            placeholder="Note (optional)"
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateStatus('acknowledged')}
              disabled={busy}
              className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Acknowledge
            </button>
            <button
              type="button"
              onClick={() => updateStatus('actioned')}
              disabled={busy}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Mark actioned
            </button>
            <button
              type="button"
              onClick={() => updateStatus('dismissed')}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">{report.status}</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
