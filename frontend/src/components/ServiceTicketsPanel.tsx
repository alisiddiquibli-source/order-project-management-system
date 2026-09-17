import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { ServiceTicket } from '../lib/types'

const STATUS_LABELS: Record<ServiceTicket['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved — awaiting confirmation',
  closed: 'Closed',
}

/**
 * Order-level service tickets (docs/ARCHITECTURE.md §5). A ticket can
 * only move open -> in_progress -> resolved through the Engineer's
 * actions here; closing always needs the customer's own confirmation
 * (or the SLA cron's auto-close) — there's deliberately no "close" button
 * for the Engineer.
 */
export function ServiceTicketsPanel({ orderId }: { orderId: number }) {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<ServiceTicket[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canRaise = user && ['customer', 'installation_engineer'].includes(user.role)
  const isEngineer = user?.role === 'installation_engineer'
  const isCustomer = user?.role === 'customer'

  async function reload() {
    setTickets(await api.get<ServiceTicket[]>(`/orders/${orderId}/service-tickets`))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load service tickets.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Service tickets</h2>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-4 space-y-3">
        {tickets?.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} isEngineer={!!isEngineer} isCustomer={!!isCustomer} onChanged={reload} />
        ))}
        {tickets?.length === 0 && <p className="text-sm text-slate-400">No service tickets on this order.</p>}
      </div>

      {canRaise && <RaiseTicketForm orderId={orderId} onCreated={reload} />}
    </div>
  )
}

function TicketRow({
  ticket,
  isEngineer,
  isCustomer,
  onChanged,
}: {
  ticket: ServiceTicket
  isEngineer: boolean
  isCustomer: boolean
  onChanged: () => Promise<void>
}) {
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  async function advance(status: string, extra?: Record<string, string>) {
    setBusy(true)
    setRowError(null)
    try {
      await api.patch(`/service-tickets/${ticket.id}/status`, { status, ...extra })
      await onChanged()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not update the ticket.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmClosure() {
    setBusy(true)
    setRowError(null)
    try {
      await api.post(`/service-tickets/${ticket.id}/confirm-closure`)
      await onChanged()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not confirm closure.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">
          #{ticket.id} · {ticket.type.replace('_', ' ')} · {ticket.severity}
        </p>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{STATUS_LABELS[ticket.status]}</span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{ticket.description}</p>
      {ticket.resolution_notes && (
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-medium">Resolution:</span> {ticket.resolution_notes}
        </p>
      )}

      {isEngineer && ticket.status === 'open' && (
        <button
          type="button"
          onClick={() => advance('in_progress')}
          disabled={busy}
          className="mt-2 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Start working on it
        </button>
      )}

      {isEngineer && ticket.status === 'in_progress' && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Resolution notes (required)"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => advance('resolved', { resolution_notes: resolutionNotes })}
            disabled={busy}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Mark resolved
          </button>
        </div>
      )}

      {isCustomer && ticket.status === 'resolved' && (
        <button
          type="button"
          onClick={confirmClosure}
          disabled={busy}
          className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Confirm it's fixed
        </button>
      )}

      {rowError && <p className="mt-2 text-sm text-red-600">{rowError}</p>}
    </div>
  )
}

function RaiseTicketForm({ orderId, onCreated }: { orderId: number; onCreated: () => Promise<void> }) {
  const [type, setType] = useState('complaint')
  const [severity, setSeverity] = useState('medium')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (description.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/service-tickets`, { type, severity, description })
      setDescription('')
      await onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not raise a ticket.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-3">
      <p className="mb-2 text-sm font-medium text-slate-700">Raise a ticket</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="complaint">Complaint</option>
          <option value="warranty_claim">Warranty claim</option>
          <option value="amc_visit">AMC visit</option>
          <option value="other">Other</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <input
          type="text"
          placeholder="Describe the issue…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || description.trim() === ''}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Submit
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
