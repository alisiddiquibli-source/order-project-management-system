import { useEffect, useRef, useState } from 'react'
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
import { ApiError, api, getAccessToken } from '../lib/api'
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
  const [showCloseout, setShowCloseout] = useState(false)
  const [closeoutReason, setCloseoutReason] = useState('')
  const [closeoutSubmitting, setCloseoutSubmitting] = useState(false)
  const [closeoutError, setCloseoutError] = useState<string | null>(null)

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

  const isOwner = user?.role === 'company_owner'
  const isActive = order?.status === 'active'
  const canEditStages = user?.role === 'project_coordinator' && isActive
  const canEditDates = user && ['project_coordinator', 'sales_manager'].includes(user.role) && isActive
  const canGenerateRiskAdvisory = user && ['sales_manager', 'project_coordinator', 'company_owner'].includes(user.role)
  // Internal staffing info (who's assigned) — not shown to Customer/Supplier
  // logins. Nothing asked for this to be external-facing, and it's BLI's
  // own staff directory, not operational data those roles need here; they
  // already reach their BLI contact via Comments.
  const isInternal = user && !['customer', 'supplier'].includes(user.role)
  const canUploadPicture = user && ['company_owner', 'sales_manager', 'project_coordinator'].includes(user.role) && isActive

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    on_hold: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-700',
    completed: 'bg-blue-100 text-blue-700',
  }

  const allComplete = stages && stages.length > 0 && stages.every((s) => s.status === 'completed')

  async function handleCloseout() {
    if (!closeoutReason.trim()) return
    setCloseoutSubmitting(true)
    setCloseoutError(null)
    try {
      await api.patch(`/orders/${id}/status`, { status: 'completed', reason: closeoutReason.trim() })
      setShowCloseout(false)
      setCloseoutReason('')
      await reload()
    } catch (err) {
      setCloseoutError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setCloseoutSubmitting(false)
    }
  }

  async function handleReopen() {
    const reason = prompt('Reason for reopening this order:')
    if (!reason?.trim()) return
    try {
      await api.patch(`/orders/${id}/status`, { status: 'active', reason: reason.trim() })
      await reload()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <AppShell title={order ? `${order.order_number} · ${order.machine_name}` : 'Order'}>
      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {order && (
        <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-900">{order.machine_name}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {order.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Order {order.order_number} · {order.supplier_name ?? 'Supplier'}
              </p>

              {/* Date badges */}
              <div className="mt-4 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 text-slate-400">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Started</p>
                    <p className="text-sm font-semibold text-slate-800">{formatDate(order.start_date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 text-slate-400">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Target</p>
                    <p className="text-sm font-semibold text-slate-800">{formatDate(order.target_handover_date)}</p>
                  </div>
                </div>
              </div>

              {/* Closeout banner — Owner-only when all stages done and order still active */}
              {allComplete && isActive && isOwner && !showCloseout && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white text-xs">!</span>
                  <span className="text-sm font-medium text-amber-800">All stages complete — closeout review needed</span>
                  <button type="button" onClick={() => setShowCloseout(true)} className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700">
                    Review closeout
                  </button>
                </div>
              )}

              {/* Closeout confirmation dialog */}
              {showCloseout && (
                <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <h4 className="mb-2 text-sm font-semibold text-amber-900">Confirm order closeout</h4>
                  <p className="mb-3 text-xs text-amber-700">This marks the order as completed. Only the Owner can reopen it afterwards.</p>
                  <textarea
                    value={closeoutReason}
                    onChange={(e) => setCloseoutReason(e.target.value)}
                    placeholder="Closeout reason (required)..."
                    className="mb-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    rows={2}
                  />
                  {closeoutError && <p className="mb-2 text-xs text-red-600">{closeoutError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCloseout} disabled={closeoutSubmitting || !closeoutReason.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
                      {closeoutSubmitting ? 'Closing...' : 'Confirm closeout'}
                    </button>
                    <button type="button" onClick={() => { setShowCloseout(false); setCloseoutError(null) }} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Completed order banner with reopen */}
              {order.status === 'completed' && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 ring-1 ring-blue-200">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-400 text-white text-xs">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  <span className="text-sm font-medium text-blue-800">This order is closed — editing is disabled</span>
                  {isOwner && (
                    <button type="button" onClick={handleReopen} className="ml-auto rounded-lg border border-blue-300 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                      Reopen order
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Machine image */}
            <OrderPicture order={order} canUpload={!!canUploadPicture} onUpdated={reload} />
          </div>

          {/* Edit order button */}
          {isInternal && isActive && (
            <div className="border-t border-slate-100 px-6 py-2">
              <OrderEditForm order={order} onUpdated={reload} />
            </div>
          )}
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

function OrderPicture({ order, canUpload, onUpdated }: { order: Order; canUpload: boolean; onUpdated: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!order.picture) { setPreviewUrl(null); return }
    const token = getAccessToken()
    fetch(`/api/documents/file/${order.picture}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.ok ? r.blob() : null)
      .then((blob) => blob ? setPreviewUrl(URL.createObjectURL(blob)) : null)
      .catch(() => setPreviewUrl(null))
  }, [order.picture])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/orders/${order.id}/picture`, form)
      await onUpdated()
    } catch { /* silently fail */ }
    finally { setUploading(false) }
  }

  if (previewUrl) {
    return (
      <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200 lg:h-48 lg:w-64">
        <img src={previewUrl} alt={order.machine_name} className="h-full w-full object-cover" />
        {canUpload && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/40 hover:opacity-100"
            >
              <span className="text-xs font-medium text-white">{uploading ? 'Uploading...' : 'Change photo'}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleUpload} className="hidden" />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-40 w-full shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200 lg:h-48 lg:w-64">
      {canUpload ? (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto h-10 w-10 text-slate-300">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <p className="mt-2 text-xs text-brand-600 hover:underline">{uploading ? 'Uploading...' : 'Upload photo'}</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleUpload} className="hidden" />
        </button>
      ) : (
        <div className="text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto h-12 w-12 text-slate-300">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="3" />
            <path d="M2 12h4M18 12h4" />
          </svg>
          <p className="mt-2 text-xs text-slate-400">{order.machine_spec ?? order.machine_name}</p>
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

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
