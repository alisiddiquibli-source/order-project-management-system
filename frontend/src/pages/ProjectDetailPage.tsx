import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { CustomerLoginPanel } from '../components/CustomerLoginPanel'
import { ApiError, api, getAccessToken } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Order, Project, Supplier, User } from '../lib/types'

/**
 * A project's orders (machines) — list plus creation. Order creation is
 * PC, Sales Manager, or Owner, matching who can create the Project itself
 * and the backend's own role gate (POST /api/orders) — widened from
 * PC-only after live testing showed the Owner (and, later, the Sales
 * Manager) had no way to create or fix an order without a PC account;
 * this form previously didn't exist at all anywhere in the app, so an
 * order could only ever be created by calling the API directly.
 */
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null)
  const [engineers, setEngineers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canCreateOrder = user && ['project_coordinator', 'sales_manager', 'company_owner'].includes(user.role)
  const canEditTitle = user && ['sales_manager', 'project_coordinator', 'company_owner', 'hr_manager'].includes(user.role)
  const canUploadPicture = user && ['company_owner', 'sales_manager', 'project_coordinator'].includes(user.role)
  // The Owner may leave dates for the Sales Manager/PC to fill in
  // afterward — a PC creating the order still has to know them.
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
        if (canCreateOrder && p.sales_manager_id) {
          setOrderNumberLoading(true)
          api.get<{ order_number: string }>(`/orders/next-number?sales_manager_id=${p.sales_manager_id}`)
            .then((r) => setOrderNumber(r.order_number))
            .catch(() => {})
            .finally(() => setOrderNumberLoading(false))
        }
      }),
      api.get<Order[]>(`/orders?project_id=${id}`).then(setOrders),
    ]
    if (canCreateOrder) {
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
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the order.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title={project ? `${project.project_number} · ${project.title}` : 'Project'}>
      {error && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {project && (
        <div className="mb-4 flex items-start gap-4">
          <div className="flex-1">
            <p className="text-sm text-slate-500">
              {project.customer_name} — <Link to={`/projects/${project.id}/media`} className="text-brand-600 hover:underline">Project media</Link>
            </p>
            {canEditTitle && (
              <ProjectEditPanel project={project} onUpdated={reload} />
            )}
          </div>
          <ProjectPicture project={project} canUpload={!!canUploadPicture} onUpdated={reload} />
        </div>
      )}

      {project && <CustomerLoginPanel projectId={project.id} />}

      {canCreateOrder && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Add a machine (order)</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input
              type="text"
              placeholder={orderNumberLoading ? 'Generating…' : 'Auto-generated'}
              value={orderNumber}
              readOnly
              className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            />
            <input
              type="text"
              placeholder="Machine name"
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Machine spec (optional)"
              value={machineSpec}
              onChange={(e) => setMachineSpec(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Supplier…</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={engineerId}
              onChange={(e) => setEngineerId(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Installation Engineer…</option>
              {engineers?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                title="Start date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                title="Target handover date"
                value={targetHandoverDate}
                onChange={(e) => setTargetHandoverDate(e.target.value)}
                className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {datesOptional && (
            <p className="mt-2 text-xs text-slate-400">
              Dates are optional for you — leave blank and the Sales Manager or PC will set the real dates
              afterward (a placeholder start/target-handover date is used in the meantime).
            </p>
          )}

          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-xs text-slate-400">No supplier yet? Add one:</span>
            <input
              type="text"
              placeholder="New supplier name"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleCreateSupplier}
              disabled={newSupplierName.trim() === ''}
              className="rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Add supplier
            </button>
          </div>

          <button
            type="button"
            onClick={handleCreateOrder}
            disabled={
              submitting ||
              orderNumberLoading ||
              !orderNumber ||
              !machineName ||
              !supplierId ||
              !engineerId ||
              (!datesOptional && (!startDate || !targetHandoverDate))
            }
            className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Create order
          </button>
        </div>
      )}

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {orders?.map((order) => (
          <Link
            key={order.id}
            to={`/orders/${order.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
          >
            <div>
              <p className="font-medium text-slate-900">
                {order.order_number} · {order.machine_name}
              </p>
              <p className="text-sm text-slate-500">
                {order.start_date} → {order.target_handover_date}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{order.status}</span>
          </Link>
        ))}
        {orders?.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No orders (machines) yet.</p>}
      </div>
    </AppShell>
  )
}

function ProjectEditPanel({ project, onUpdated }: { project: Project; onUpdated: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(project.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs text-brand-600 hover:underline">
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
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <button type="button" onClick={handleSave} disabled={saving || !title} className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60">
        Save
      </button>
      <button type="button" onClick={() => { setEditing(false); setTitle(project.title) }} className="text-xs text-slate-500 hover:underline">
        Cancel
      </button>
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
