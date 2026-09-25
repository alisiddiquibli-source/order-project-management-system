import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { CustomerLoginPanel } from '../components/CustomerLoginPanel'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import { ApiError, api, getAccessToken } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Order, OrderStage, Project, Supplier, User } from '../lib/types'

interface OrderWithStages extends Order {
  stages: OrderStage[]
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [orders, setOrders] = useState<OrderWithStages[] | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null)
  const [engineers, setEngineers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const isOwner = user?.role === 'company_owner'
  const isActive = project?.status === 'active'
  const canCreateOrder = isActive && user && ['project_coordinator', 'sales_manager', 'company_owner'].includes(user.role)
  const canEditTitle = isActive && user && ['sales_manager', 'project_coordinator', 'company_owner', 'hr_manager'].includes(user.role)
  const canUploadPicture = isActive && user && ['company_owner', 'sales_manager', 'project_coordinator'].includes(user.role)
  const datesOptional = user?.role === 'company_owner'

  const [orderNumber, setOrderNumber] = useState('')
  const [orderNumberLoading, setOrderNumberLoading] = useState(false)
  const [machineName, setMachineName] = useState('')
  const [machineSpec, setMachineSpec] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [engineerId, setEngineerId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetHandoverDate, setTargetHandoverDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function reload() {
    const requests: Promise<unknown>[] = [
      api.get<Project>(`/projects/${id}`).then((p) => {
        setProject(p)
        if (p.status === 'active' && user && ['project_coordinator', 'sales_manager', 'company_owner'].includes(user.role) && p.sales_manager_id) {
          setOrderNumberLoading(true)
          api.get<{ order_number: string }>(`/orders/next-number?sales_manager_id=${p.sales_manager_id}`)
            .then((r) => setOrderNumber(r.order_number))
            .catch(() => {})
            .finally(() => setOrderNumberLoading(false))
        }
      }),
      api.get<Order[]>(`/orders?project_id=${id}`).then(async (rawOrders) => {
        const withStages = await Promise.all(
          rawOrders.map(async (order) => ({
            ...order,
            stages: await api.get<OrderStage[]>(`/orders/${order.id}/stages`).catch(() => [] as OrderStage[]),
          }))
        )
        setOrders(withStages)
      }),
    ]
    if (user && ['project_coordinator', 'sales_manager', 'company_owner'].includes(user.role)) {
      requests.push(
        api.get<Supplier[]>('/suppliers').then(setSuppliers),
        api.get<User[]>('/users?role=installation_engineer').then(setEngineers),
      )
    }
    await Promise.all(requests)
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load this project.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleCreateSupplier() {
    if (newSupplierName.trim() === '') return
    setError(null)
    try {
      const supplier = await api.post<Supplier>('/suppliers', { name: newSupplierName })
      setSuppliers((prev) => [...(prev ?? []), supplier].sort((a, b) => a.name.localeCompare(b.name)))
      setSupplierId(String(supplier.id))
      setNewSupplierName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the supplier.')
    }
  }

  async function handleCreateOrder() {
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/orders', {
        project_id: Number(id),
        order_number: orderNumber,
        machine_name: machineName,
        machine_spec: machineSpec || undefined,
        supplier_id: Number(supplierId),
        installation_engineer_id: Number(engineerId),
        start_date: startDate || undefined,
        target_handover_date: targetHandoverDate || undefined,
      })
      setOrderNumber('')
      setMachineName('')
      setMachineSpec('')
      setSupplierId('')
      setEngineerId('')
      setStartDate('')
      setTargetHandoverDate('')
      setShowCreateForm(false)
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the order.')
    } finally {
      setSubmitting(false)
    }
  }

  const allOrdersCompleted = orders && orders.length > 0 && orders.every((o) => o.status === 'completed')
  const activeCount = orders?.filter((o) => o.status === 'active').length ?? 0
  const completedOrderCount = orders?.filter((o) => o.status === 'completed').length ?? 0

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-blue-100 text-blue-700',
  }

  return (
    <AppShell title={project ? `${project.project_number} · ${project.title}` : 'Project'}>
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Project Header Card */}
      {project && (
        <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-900">{project.title}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[project.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {project.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {project.project_number} · {project.customer_name}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link to={`/projects/${project.id}/media`} className="text-xs font-medium text-brand-600 hover:underline">
                  Project media
                </Link>
                {canEditTitle && <ProjectEditPanel project={project} onUpdated={reload} />}
              </div>

              {/* Summary stats */}
              {orders && orders.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                    <span className="text-xs text-slate-500">Orders:</span>{' '}
                    <span className="text-sm font-semibold text-slate-800">{orders.length}</span>
                  </div>
                  {activeCount > 0 && (
                    <div className="rounded-lg bg-emerald-50 px-3 py-1.5">
                      <span className="text-xs text-emerald-600">Active:</span>{' '}
                      <span className="text-sm font-semibold text-emerald-700">{activeCount}</span>
                    </div>
                  )}
                  {completedOrderCount > 0 && (
                    <div className="rounded-lg bg-blue-50 px-3 py-1.5">
                      <span className="text-xs text-blue-600">Completed:</span>{' '}
                      <span className="text-sm font-semibold text-blue-700">{completedOrderCount}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Project close/reopen */}
              {isOwner && isActive && allOrdersCompleted && (
                <ProjectStatusAction projectId={project.id} action="close" onUpdated={reload} />
              )}
              {isOwner && !isActive && (
                <ProjectStatusAction projectId={project.id} action="reopen" onUpdated={reload} />
              )}
            </div>

            <ProjectPicture project={project} canUpload={!!canUploadPicture} onUpdated={reload} />
          </div>

          {!isActive && (
            <div className="border-t border-blue-100 bg-blue-50 px-6 py-3">
              <p className="text-sm font-medium text-blue-700">
                This project is closed. Only service tickets and AMC visits remain active.
                {isOwner && ' You can reopen it above.'}
              </p>
            </div>
          )}
        </div>
      )}

      {project && <CustomerLoginPanel projectId={project.id} />}

      {/* Orders (machines) Section */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Machines ({orders?.length ?? 0})
          </h3>
          {canCreateOrder && (
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              {showCreateForm ? 'Cancel' : '+ Add machine'}
            </button>
          )}
        </div>

        {/* Create order form (collapsible) */}
        {canCreateOrder && showCreateForm && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <input type="text" placeholder={orderNumberLoading ? 'Generating...' : 'Auto-generated'} value={orderNumber} readOnly className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
              <input type="text" placeholder="Machine name" value={machineName} onChange={(e) => setMachineName(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input type="text" placeholder="Machine spec (optional)" value={machineSpec} onChange={(e) => setMachineSpec(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Supplier...</option>
                {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={engineerId} onChange={(e) => setEngineerId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Installation Engineer...</option>
                {engineers?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
              <div className="flex gap-2">
                <input type="date" title="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <input type="date" title="Target handover" value={targetHandoverDate} onChange={(e) => setTargetHandoverDate(e.target.value)} className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            {datesOptional && (
              <p className="mt-2 text-xs text-slate-400">Dates are optional for you — leave blank and the SM or PC will set them afterward.</p>
            )}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs text-slate-400">No supplier yet?</span>
              <input type="text" placeholder="New supplier name" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button type="button" onClick={handleCreateSupplier} disabled={newSupplierName.trim() === ''} className="rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">Add supplier</button>
            </div>
            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={submitting || orderNumberLoading || !orderNumber || !machineName || !supplierId || !engineerId || (!datesOptional && (!startDate || !targetHandoverDate))}
              className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Create order
            </button>
          </div>
        )}

        {/* Order Cards */}
        <div className="space-y-3">
          {orders?.map((order) => <OrderCard key={order.id} order={order} />)}
          {orders?.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <p className="text-sm text-slate-400">No machines (orders) yet.</p>
              {canCreateOrder && (
                <button type="button" onClick={() => setShowCreateForm(true)} className="mt-2 text-sm font-medium text-brand-600 hover:underline">
                  Add the first machine
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function OrderCard({ order }: { order: OrderWithStages }) {
  const completed = order.stages.filter((s) => s.status === 'completed').length
  const total = order.stages.length || 12
  const current = order.stages.find((s) => s.status !== 'completed' && s.status !== 'not_started')
    ?? order.stages.find((s) => s.status === 'not_started')
  const allComplete = completed === total && total > 0

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    on_hold: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-700',
    completed: 'bg-blue-100 text-blue-700',
  }

  return (
    <Link
      to={`/orders/${order.id}`}
      className="block rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md"
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-base font-semibold text-slate-900">{order.machine_name}</h4>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {order.status.replace('_', ' ')}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {order.order_number} · {order.supplier_name ?? 'Supplier'}
          </p>

          {/* Dates row */}
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span>Start: <span className="font-medium text-slate-700">{formatDate(order.start_date)}</span></span>
            <span>Target: <span className="font-medium text-slate-700">{formatDate(order.target_handover_date)}</span></span>
          </div>
        </div>

        {/* Progress + stage */}
        <div className="flex flex-col items-end gap-2 sm:min-w-[200px]">
          <ProgressBar completed={completed} total={total} />
          {order.status === 'completed' ? (
            <span className="text-xs font-medium text-blue-600">Closed out</span>
          ) : allComplete ? (
            <span className="text-xs font-medium text-amber-600">Closeout review needed</span>
          ) : current ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{current.stage_name}</span>
              <StatusBadge status={current.status} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Team row */}
      <div className="flex flex-wrap gap-4 border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
        {order.project_coordinator_name && <span>PC: <span className="font-medium text-slate-700">{order.project_coordinator_name}</span></span>}
        {order.installation_engineer_name && <span>Engineer: <span className="font-medium text-slate-700">{order.installation_engineer_name}</span></span>}
        {order.sales_manager_name && <span>SM: <span className="font-medium text-slate-700">{order.sales_manager_name}</span></span>}
      </div>
    </Link>
  )
}

function ProjectStatusAction({ projectId, action, onUpdated }: { projectId: number; action: 'close' | 'reopen'; onUpdated: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAction() {
    const msg = action === 'close'
      ? 'Close this project? All orders must be completed first. The project will become read-only except for service items.'
      : 'Reopen this project? It will become editable again.'
    if (!window.confirm(msg)) return

    setSubmitting(true)
    setError(null)
    try {
      await api.patch(`/projects/${projectId}/status`, {
        status: action === 'close' ? 'completed' : 'active',
      })
      await onUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change project status.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3">
      {action === 'close' && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white text-xs font-bold">!</span>
          <span className="text-sm font-medium text-amber-800">All orders completed — ready to close this project</span>
          <button type="button" onClick={handleAction} disabled={submitting} className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            Close project
          </button>
        </div>
      )}
      {action === 'reopen' && (
        <button type="button" onClick={handleAction} disabled={submitting} className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          Reopen project
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function ProjectEditPanel({ project, onUpdated }: { project: Project; onUpdated: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(project.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-600 hover:underline">
        Edit title
      </button>
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/projects/${project.id}`, { title })
      setEditing(false)
      await onUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
      <button type="button" onClick={handleSave} disabled={saving || !title} className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60">Save</button>
      <button type="button" onClick={() => { setEditing(false); setTitle(project.title) }} className="text-xs text-slate-500 hover:underline">Cancel</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

function ProjectPicture({ project, canUpload, onUpdated }: { project: Project; canUpload: boolean; onUpdated: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!project.picture) { setPreviewUrl(null); return }
    const token = getAccessToken()
    fetch(`/api/documents/file/${project.picture}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.ok ? r.blob() : null)
      .then((blob) => blob ? setPreviewUrl(URL.createObjectURL(blob)) : null)
      .catch(() => setPreviewUrl(null))
  }, [project.picture])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/projects/${project.id}/picture`, form)
      await onUpdated()
    } catch { /* silently fail */ }
    finally { setUploading(false) }
  }

  return (
    <div className="shrink-0">
      <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {previewUrl ? (
          <img src={previewUrl} alt="Project" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
        {canUpload && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/40 hover:opacity-100"
          >
            <span className="text-xs font-medium text-white">{uploading ? '...' : 'Upload'}</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleUpload} className="hidden" />
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
