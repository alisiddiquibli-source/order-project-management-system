import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { CommentsPanel } from '../components/CommentsPanel'
import { ServiceTicketsPanel } from '../components/ServiceTicketsPanel'
import { StatusBadge } from '../components/StatusBadge'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Order, OrderStage } from '../lib/types'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [stages, setStages] = useState<OrderStage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedStageId, setExpandedStageId] = useState<number | null>(null)

  async function reload() {
    const [orderData, stagesData] = await Promise.all([
      api.get<Order>(`/orders/${id}`),
      api.get<OrderStage[]>(`/orders/${id}/stages`),
    ])
    setOrder(orderData)
    setStages(stagesData)
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load this order.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const canEditStages = user?.role === 'project_coordinator'

  return (
    <AppShell title={order ? `${order.order_number} · ${order.machine_name}` : 'Order'}>
      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {order && (
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
          <Field label="Status" value={order.status.replace('_', ' ')} />
          <Field label="Start date" value={order.start_date} />
          <Field label="Target handover" value={order.target_handover_date} />
          <Field label="Machine spec" value={order.machine_spec ?? '—'} />
        </div>
      )}

      {stages && (
        <ol className="space-y-2">
          {stages.map((stage) => (
            <li key={stage.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setExpandedStageId(expandedStageId === stage.id ? null : stage.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                    {stage.sequence}
                  </span>
                  <span className="font-medium text-slate-900">{stage.stage_name}</span>
                </div>
                <StatusBadge status={stage.status} />
              </button>

              {expandedStageId === stage.id && (
                <div className="border-t border-slate-100 px-4 py-4">
                  <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Field label="Planned start" value={stage.planned_start ?? '—'} />
                    <Field label="Planned end" value={stage.planned_end ?? '—'} />
                    <Field label="Actual start" value={stage.actual_start ?? '—'} />
                    <Field label="Actual end" value={stage.actual_end ?? '—'} />
                  </div>
                  {stage.notes && <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{stage.notes}</p>}

                  {canEditStages && order?.status === 'active' && (
                    <StageUpdateForm stage={stage} onUpdated={reload} />
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {order && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ServiceTicketsPanel orderId={order.id} />
          <CommentsPanel orderId={order.id} />
        </div>
      )}
    </AppShell>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  )
}

function StageUpdateForm({ stage, onUpdated }: { stage: OrderStage; onUpdated: () => Promise<void> }) {
  const [status, setStatus] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function handleSubmit() {
    setSubmitting(true)
    setFeedback(null)
    try {
      const body: Record<string, string> = {}
      if (status) body.status = status
      if (notes) body.notes = notes
      if (Object.keys(body).length === 0) {
        setFeedback({ type: 'error', text: 'Choose a new status or add a note before saving.' })
        return
      }

      await api.patch(`/orders/${stage.order_id}/stages/${stage.stage_id}`, body)
      setFeedback({ type: 'success', text: 'Saved.' })
      setStatus('')
      setNotes('')
      await onUpdated()
    } catch (err) {
      // Business-rule rejections are shown verbatim — the whole point of
      // this system is that these gates are real, not decorative.
      setFeedback({ type: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Change status…</option>
          <option value="in_progress">Mark in progress</option>
          <option value="completed">Mark completed</option>
        </select>
        <input
          type="text"
          placeholder="Add a note (optional, or required for some transitions)"
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
          Save
        </button>
      </div>
      {feedback && (
        <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{feedback.text}</p>
      )}
    </div>
  )
}
