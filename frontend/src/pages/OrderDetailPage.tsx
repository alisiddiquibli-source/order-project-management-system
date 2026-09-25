import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AiReportsPanel } from '../components/AiReportsPanel'
import { AmcSection } from '../components/AmcSection'
import { AppShell } from '../components/AppShell'
import { CommentsPanel } from '../components/CommentsPanel'
import { OrderEditForm } from '../components/OrderEditForm'
import { PipelineFlowchart } from '../components/PipelineFlowchart'
import { ProgressRing } from '../components/ProgressRing'
import { ServiceTicketsPanel } from '../components/ServiceTicketsPanel'
import { StageEvidence } from '../components/StageEvidence'
import { StatusBadge } from '../components/StatusBadge'
import { ApiError, api, getAccessToken } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { AiReport, Order, OrderStage, User } from '../lib/types'

type Tab = 'overview' | 'stages' | 'documents' | 'activity' | 'service'

const STAGE_GROUPS = [
  { label: 'Planning & order', icon: '📋', stages: [1, 2] },
  { label: 'Manufacturing & FAT', icon: '⚙️', stages: [3, 4, 5] },
  { label: 'Shipment & delivery', icon: '🚢', stages: [6, 7, 8] },
  { label: 'Installation & handover', icon: '🔧', stages: [9, 10, 11, 12] },
]

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [stages, setStages] = useState<OrderStage[] | null>(null)
  const [aiReports, setAiReports] = useState<AiReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedStageId, setExpandedStageId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const [showCloseout, setShowCloseout] = useState(false)
  const [closeoutReason, setCloseoutReason] = useState('')
  const [closeoutSubmitting, setCloseoutSubmitting] = useState(false)
  const [closeoutError, setCloseoutError] = useState<string | null>(null)

  const isOwner = user?.role === 'company_owner'
  const isActive = order?.status === 'active'

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

  const canEditStages = user?.role === 'project_coordinator' && isActive
  const canEditDates = user && ['project_coordinator', 'sales_manager'].includes(user.role) && isActive
  const canGenerateRiskAdvisory = user && ['sales_manager', 'project_coordinator', 'company_owner'].includes(user.role)
  const isInternal = user && !['customer', 'supplier'].includes(user.role)
  const canUploadPicture = user && ['company_owner', 'sales_manager', 'project_coordinator'].includes(user.role)

  const completedCount = stages?.filter((s) => s.status === 'completed').length ?? 0
  const totalStages = stages?.length ?? 12
  const allComplete = completedCount === totalStages && totalStages > 0

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    on_hold: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-700',
    completed: 'bg-blue-100 text-blue-700',
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'stages', label: 'Stages' },
    { key: 'documents', label: 'Documents' },
    { key: 'activity', label: 'Activity' },
    { key: 'service', label: 'Service' },
  ]

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
    <AppShell
      title={order ? `${order.order_number} · ${order.machine_name}` : 'Order'}
      breadcrumbs={order ? [{ label: 'Projects', to: '/' }, { label: `Order ${order.order_number}` }] : undefined}
    >
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Completed order banner */}
      {order && order.status === 'completed' && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 ring-1 ring-blue-200">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="h-5 w-5 shrink-0">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span className="text-sm font-medium text-blue-800">This order has been closed out.</span>
          {isOwner && (
            <button type="button" onClick={handleReopen} className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700">
              Reopen order
            </button>
          )}
        </div>
      )}

      {/* Hero Card */}
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

              {/* Alert banner — closeout needed */}
              {allComplete && isActive && isOwner && !showCloseout && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white text-xs">!</span>
                  <span className="text-sm font-medium text-amber-800">All stages complete — closeout review needed</span>
                  <button
                    type="button"
                    onClick={() => setShowCloseout(true)}
                    className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
                  >
                    Review closeout
                  </button>
                </div>
              )}
              {allComplete && isActive && !isOwner && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white text-xs">!</span>
                  <span className="text-sm font-medium text-amber-800">All stages complete — waiting for Owner to review closeout</span>
                </div>
              )}

              {/* Closeout dialog */}
              {showCloseout && (
                <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200 shadow-md">
                  <h4 className="mb-2 text-sm font-semibold text-slate-900">Closeout review</h4>
                  <p className="mb-3 text-xs text-slate-500">
                    Closing this order marks it as completed. All {totalStages} stages are done.
                    Please provide a reason or summary for the closeout.
                  </p>
                  <textarea
                    value={closeoutReason}
                    onChange={(e) => setCloseoutReason(e.target.value)}
                    placeholder="Closeout reason / summary..."
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  {closeoutError && <p className="mt-1 text-sm text-red-600">{closeoutError}</p>}
                  <div className="mt-3 flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowCloseout(false); setCloseoutReason(''); setCloseoutError(null) }}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseout}
                      disabled={closeoutSubmitting || !closeoutReason.trim()}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {closeoutSubmitting ? 'Closing...' : 'Confirm closeout'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Machine picture */}
            <OrderPicture order={order} canUpload={!!canUploadPicture && isActive} onUploaded={reload} />
          </div>

          {/* Edit order button — only if active */}
          {isInternal && isActive && (
            <div className="border-t border-slate-100 px-6 py-2">
              <OrderEditForm order={order} onUpdated={reload} />
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && order && stages && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Project journey */}
            <div className="lg:col-span-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="mb-1 text-base font-semibold text-slate-900">Project journey</h3>
              <p className="mb-5 text-xs text-slate-500">
                {allComplete ? 'All 12 stages completed' : `${completedCount} of ${totalStages} stages completed`}
              </p>

              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <ProgressRing completed={completedCount} total={totalStages} />

                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  {STAGE_GROUPS.map((group) => {
                    const groupStages = stages.filter((s) => group.stages.includes(s.stage_id))
                    const groupDone = groupStages.filter((s) => s.status === 'completed').length
                    const allDone = groupDone === groupStages.length
                    return (
                      <button
                        key={group.label}
                        type="button"
                        onClick={() => setActiveTab('stages')}
                        className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100"
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${allDone ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                          {allDone ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" className="h-5 w-5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <span className="text-lg">{group.icon}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{group.label}</p>
                          <p className="text-xs text-slate-500">{groupDone} / {groupStages.length} complete</p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-slate-300">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Team panel */}
            {isInternal && (
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h3 className="mb-4 text-base font-semibold text-slate-900">Your team</h3>
                <div className="space-y-4">
                  <TeamMember name={order.sales_manager_name} role="Sales manager" />
                  <TeamMember name={order.project_coordinator_name} role="Project coordinator" />
                  <TeamMember name={order.installation_engineer_name} role="Installation engineer" />
                  <TeamMember name={order.supplier_name} role="Supplier" />
                </div>
              </div>
            )}
          </div>

          {/* Pipeline flowchart */}
          <PipelineFlowchart orderId={order.id} stages={stages} />

          {/* Bottom panels */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="mb-4 text-base font-semibold text-slate-900">Latest activity</h3>
              <CommentsPanel orderId={order.id} />
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="mb-1 text-base font-semibold text-slate-900">After-sales</h3>
              <ServiceTicketsPanel orderId={order.id} />
              <div className="mt-4">
                <AmcSection orderId={order.id} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stages Tab */}
      {activeTab === 'stages' && stages && (
        <ol className="space-y-2">
          {stages.map((stage) => (
            <li key={stage.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setExpandedStageId(expandedStageId === stage.id ? null : stage.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                    stage.status === 'completed' ? 'bg-emerald-500' :
                    stage.status === 'in_progress' ? 'bg-blue-500' :
                    stage.status === 'delayed' ? 'bg-amber-500' :
                    stage.status === 'blocked' ? 'bg-red-500' :
                    'bg-slate-300'
                  }`}>
                    {stage.status === 'completed' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-4 w-4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      stage.sequence
                    )}
                  </span>
                  <span className="font-medium text-slate-900">{stage.stage_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={stage.status} />
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 text-slate-400 transition-transform ${expandedStageId === stage.id ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {expandedStageId === stage.id && (
                <div className="border-t border-slate-100 px-5 py-5">
                  <div className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                    <Field label="Planned start" value={stage.planned_start ?? '—'} />
                    <Field label="Planned end" value={stage.planned_end ?? '—'} />
                    <Field label="Actual start" value={stage.actual_start ?? '—'} />
                    <Field label="Actual end" value={stage.actual_end ?? '—'} />
                  </div>
                  {stage.notes && <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{stage.notes}</p>}

                  {canEditDates && order?.status === 'active' && (
                    <div className="mb-4">
                      <StageDatesForm stage={stage} onUpdated={reload} />
                    </div>
                  )}

                  {canEditStages && order?.status === 'active' && (
                    <StageUpdateForm stage={stage} onUpdated={reload} />
                  )}

                  {order && (
                    <div className="mt-4">
                      <StageEvidence orderId={order.id} stage={stage} />
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && order && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">View stage-level documents in the Stages tab, or upload project-level documents below.</p>
          {stages?.map((stage) => (
            <div key={stage.id} className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-slate-700">{stage.sequence}. {stage.stage_name}</h4>
              <StageEvidence orderId={order.id} stage={stage} />
            </div>
          ))}
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && order && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <CommentsPanel orderId={order.id} />
          </div>
          {canGenerateRiskAdvisory && (
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <AiReportsPanel
                title="AI risk advisory"
                reports={aiReports}
                canGenerate={true}
                generateLabel="Generate risk advisory"
                onGenerate={() => api.post(`/orders/${order.id}/ai/risk-advisory`).then(reload)}
                onChanged={reload}
              />
            </div>
          )}
        </div>
      )}

      {/* Service Tab */}
      {activeTab === 'service' && order && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <ServiceTicketsPanel orderId={order.id} />
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <AmcSection orderId={order.id} />
          </div>
        </div>
      )}
    </AppShell>
  )
}

function OrderPicture({ order, canUpload, onUploaded }: { order: Order; canUpload: boolean; onUploaded: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!order.picture) return
    const token = getAccessToken()
    fetch(`/api/documents/file/${order.picture}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob) setPreviewUrl(URL.createObjectURL(blob))
      })
      .catch(() => {})
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.picture])

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('picture', file)
      await api.post(`/orders/${order.id}/picture`, form)
      await onUploaded()
    } catch {
      alert('Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  if (previewUrl) {
    return (
      <div className="relative flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-slate-200 lg:h-48 lg:w-64">
        <img src={previewUrl} alt={order.machine_name} className="h-full w-full object-cover" />
        {canUpload && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow hover:bg-white"
            >
              Change
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </>
        )}
      </div>
    )
  }

  return (
    <div
      className={`flex h-40 w-full shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200 lg:h-48 lg:w-64 ${canUpload ? 'cursor-pointer hover:ring-brand-300' : ''}`}
      onClick={() => canUpload && fileRef.current?.click()}
    >
      <div className="text-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto h-12 w-12 text-slate-300">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <path d="M2 12h4M18 12h4" />
        </svg>
        <p className="mt-2 text-xs text-slate-400">
          {uploading ? 'Uploading...' : canUpload ? 'Click to upload picture' : (order.machine_spec ?? order.machine_name)}
        </p>
      </div>
      {canUpload && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />}
    </div>
  )
}

function TeamMember({ name, role }: { name: string | null; role: string }) {
  const initials = name ? name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '?'
  const colors = ['bg-brand-100 text-brand-700', 'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700', 'bg-rose-100 text-rose-700']
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colors[colorIndex]}`}>
        {initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{name ?? '—'}</p>
        <p className="text-xs capitalize text-slate-500">{role}</p>
      </div>
    </div>
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
      setFeedback({ type: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Change planned dates</h4>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input type="date" title="Planned start" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" title="Planned end" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="text" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Approved by…</option>
          {approvers?.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
          ))}
        </select>
        <button type="button" onClick={handleSubmit} disabled={submitting || !reason || (!plannedStart && !plannedEnd)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
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
      setFeedback({ type: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Change status…</option>
          <option value="in_progress">Mark in progress</option>
          <option value="completed">Mark completed</option>
        </select>
        <input type="text" placeholder="Add a note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="button" onClick={handleSubmit} disabled={submitting} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          Save
        </button>
      </div>
      {feedback && (
        <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{feedback.text}</p>
      )}
    </div>
  )
}
