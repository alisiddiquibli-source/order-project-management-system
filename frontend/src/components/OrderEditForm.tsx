import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Order, Supplier, User } from '../lib/types'

/**
 * Corrects an order's own details after creation — previously there was
 * no way to fix a typo or reassignment at all short of a direct database
 * edit. PC/Owner only, matching who can create an order (§ARCHITECTURE.md
 * — order creation was widened from PC-only after live testing showed the
 * Owner had no way to create or fix an order without a PC account).
 */
export function OrderEditForm({ order, onUpdated }: { order: Order; onUpdated: () => Promise<void> }) {
  const { user } = useAuth()
  const canEdit = user && ['project_coordinator', 'company_owner'].includes(user.role)

  const [machineName, setMachineName] = useState(order.machine_name)
  const [machineSpec, setMachineSpec] = useState(order.machine_spec ?? '')
  const [supplierId, setSupplierId] = useState(String(order.supplier_id))
  const [engineerId, setEngineerId] = useState(String(order.installation_engineer_id))
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null)
  const [engineers, setEngineers] = useState<User[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canEdit) return
    Promise.all([
      api.get<Supplier[]>('/suppliers').then(setSuppliers),
      api.get<User[]>('/users?role=installation_engineer').then(setEngineers),
    ]).catch(() => setError('Could not load suppliers/engineers.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      await api.patch(`/orders/${order.id}`, {
        machine_name: machineName,
        machine_spec: machineSpec || null,
        supplier_id: Number(supplierId),
        installation_engineer_id: Number(engineerId),
      })
      setSaved(true)
      await onUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Edit order details</h3>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="mb-2 text-sm text-emerald-600">Saved.</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Machine name"
          value={machineName}
          onChange={(e) => setMachineName(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Machine spec"
          value={machineSpec}
          onChange={(e) => setMachineSpec(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={engineerId} onChange={(e) => setEngineerId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          {engineers?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={submitting || !machineName || !supplierId || !engineerId}
        className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        Save changes
      </button>

      <TargetHandoverDateForm order={order} onUpdated={onUpdated} />
    </div>
  )
}

/**
 * Separate from the plain edit above on purpose — this field is the
 * whole-order external commitment to the customer, so the backend
 * requires a reason and a Sales Manager/Owner approver, recorded as a
 * commitment_changes row rather than a silent UPDATE (§4.1). This is the
 * form for an endpoint that's existed since Phase 1 but never had one.
 */
function TargetHandoverDateForm({ order, onUpdated }: { order: Order; onUpdated: () => Promise<void> }) {
  const { user } = useAuth()
  const canRequest = user && ['project_coordinator', 'sales_manager', 'company_owner'].includes(user.role)

  const [approvers, setApprovers] = useState<User[] | null>(null)
  const [newDate, setNewDate] = useState('')
  const [reason, setReason] = useState('')
  const [approvedBy, setApprovedBy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canRequest) return
    Promise.all([api.get<User[]>('/users?role=sales_manager'), api.get<User[]>('/users?role=company_owner')])
      .then(([salesManagers, owners]) => setApprovers([...salesManagers, ...owners]))
      .catch(() => setError('Could not load approvers.'))
  }, [canRequest])

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      await api.patch(`/orders/${order.id}/target-handover-date`, {
        target_handover_date: newDate,
        reason,
        approved_by: Number(approvedBy),
      })
      setSaved(true)
      setReason('')
      await onUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the target handover date.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canRequest) return null

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Change target handover date</h4>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="mb-2 text-sm text-emerald-600">Target handover date updated.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Reason (required — this is a customer commitment)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Approved by…</option>
          {approvers?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !newDate || !reason || !approvedBy}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Save
        </button>
      </div>
    </div>
  )
}
