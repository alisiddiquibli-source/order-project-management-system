import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AiReportsPanel } from '../components/AiReportsPanel'
import { AmcSection } from '../components/AmcSection'
import { AppShell } from '../components/AppShell'
import { CommentsPanel } from '../components/CommentsPanel'
import { OrderEditForm } from '../components/OrderEditForm'
import { PipelineFlowchart } from '../components/PipelineFlowchart'
import { ServiceTicketsPanel } from '../components/ServiceTicketsPanel'
import { StageEvidence } from '../components/StageEvidence'
import { StatusBadge } from '../components/StatusBadge'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { AiReport, Order, OrderStage, User } from '../lib/types'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [stages, setStages] = useState<OrderStage[] | null>(null)
  const [aiReports, setAiReports] = useState<AiReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedStageId, setExpandedStageId] = useState<number | null>(null)

  async function reload() {
    const [orderData, stagesData, aiReportsData] = await Promise.all([
      api.get<Order>(`/orders/${id}`),
      api.get<OrderStage[]>(`/orders/${id}/stages`),
      api.get<AiReport[]>('/ai-reports'),
    ])
    setOrder(orderData)
    setStages(stagesData)
    setAiReports(aiReportsData.filter((r) => r.order_id === orderData.id))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load this order.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const canEditStages = user?.role === 'project_coordinator'
  // Sales Manager and PC can move a stage's planned dates (business rule);
  // marking a stage's status or notes stays PC-only, the sole stage-status
  // writer — enforced the same way on the backend (orders.php).
  const canEditDates = user && ['project_coordinator', 'sales_manager'].includes(user.role)
  const canGenerateRiskAdvisory = user && ['sales_manager', 'project_coordinator', 'company_owner'].includes(user.role)
  // Internal staffing info (who's assigned) — not shown to Customer/Supplier
  // logins. Nothing asked for this to be external-facing, and it's BLI's
  // own staff directory, not operational data those roles need here; they
  // already reach their BLI contact via Comments.
  const isInternal = user && !['customer', 'supplier'].includes(user.role)

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

      {order && stages && <PipelineFlowchart orderId={order.id} stages={stages} />}

      {order && isInternal && (
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
          <Field label="Sales Manager" value={order.sales_manager_name ?? '—'} />
          <Field label="Project Coordinator" value={order.project_coordinator_name ?? '—'} />
          <Field label="Installation Engineer" value={order.installation_engineer_name ?? '—'} />
          <Field label="Supplier" value={order.supplier_name ?? '—'} />
        </div>
      )}

      {order && (
        <div className="mb-6">
          <OrderEditForm order={order} onUpdated={reload} />
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

                  {canEditDates && order?.status === 'active' && (
                    <div className="mb-3">
                      <StageDatesForm stage={stage} onUpdated={reload} />
                    </div>
                  )}

                  {canEditStages && order?.status === 'active' && (
                    <StageUpdateForm stage={stage} onUpdated={reload} />
                  )}

                  {order && (
                    <div className="mt-3">
                      <StageEvidence orderId={order.id} stage={stage} />
                    </div>
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

      {order && (
        <div className="mt-4">
          <AmcSection orderId={order.id} />
        </div>
      )}

      {order && (
        <div className="mt-4">
          <AiReportsPanel
            title="AI risk advisory"
            reports={aiReports}
            canGenerate={!!canGenerateRiskAdvisory}
            generateLabel="Generate risk advisory"
            onGenerate={() => api.post(`/orders/${order.id}/ai/risk-advisory`).then(reload)}
            onChanged={reload}
          />
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

/**
 * Backend has always accepted planned_start/planned_end on this endpoint
 * (with a reason, and — once a customer-informed date is being changed —
 * a Sales Manager/Owner approver, per OrderStageRepository::updatePlannedDates),
 * but no UI ever exposed it: there was simply no way, for any role, to
 * set a stage's planned dates short of a direct database edit. Mirrors
 * OrderEditForm's TargetHandoverDateForm pattern.
 */
function StageDatesForm({ stage, onUpdated }: { stage: OrderStage; onUpdated: () => Promise<void> }) {
  const [approvers, setApprovers] = useState<User[] | null>(null)
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [reason, setReason] = useState('')
  const [approvedBy, setApprovedBy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    Promise.all([api.get<User[]>('/users?role=sales_manager'), api.get<User[]>('/users?role=company_owner')])
      .then(([salesManagers, owners]) => setApprovers([...salesManagers, ...owners]))
      .catch(() => {})
  }, [])

  async function handleSubmit() {
    setSubmitting(true)
    setFeedback(null)
    try {
      if (!plannedStart && !plannedEnd) {
        setFeedback({ type: 'error', text: 'Set a planned start and/or end date before saving.' })
        return
      }
      const body: Record<string, string | number> = { reason }
      if (plannedStart) body.planned_start = plannedStart
      if (plannedEnd) body.planned_end = plannedEnd
      if (approvedBy) body.approved_by = Number(approvedBy)

      await api.patch(`/orders/${stage.order_id}/stages/${stage.stage_id}`, body)
      setFeedback({ type: 'success', text: 'Planned dates saved.' })
      setPlannedStart('')
      setPlannedEnd('')
      setReason('')
      setApprovedBy('')
      await onUpdated()
    } catch (err) {
      // Business-rule rejections are shown verbatim, e.g. "already
      // communicated to the customer — needs a Sales Manager/Owner approver."
      setFeedback({ type: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Change planned dates</h4>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="date"
          title="Planned start"
          value={plannedStart}
          onChange={(e) => setPlannedStart(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          title="Planned end"
          value={plannedEnd}
          onChange={(e) => setPlannedEnd(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Approved by… (if already told to the customer)</option>
          {approvers?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !reason || (!plannedStart && !plannedEnd)}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Save
        </button>
      </div>
      {feedback && (
        <p className={`mt-2 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{feedback.text}</p>
      )}
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
