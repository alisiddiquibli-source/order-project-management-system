import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Shipment } from '../lib/types'

/**
 * Stage 6 evidence (docs/ARCHITECTURE.md §3.1/§3.2): a shipment booking
 * alone only supports `in_progress` — completing the stage needs
 * `actual_dispatch_date`, set separately from the booking itself since a
 * carrier is usually booked well before the machine actually ships.
 */
export function ShipmentSection({ orderId }: { orderId: number }) {
  const { user } = useAuth()
  const [shipments, setShipments] = useState<Shipment[] | null>(null)
  const [carrier, setCarrier] = useState('')
  const [mode, setMode] = useState('sea')
  const [etd, setEtd] = useState('')
  const [eta, setEta] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEdit = user?.role === 'project_coordinator'

  async function reload() {
    setShipments(await api.get<Shipment[]>(`/orders/${orderId}/shipments`))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load shipments.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/shipments`, {
        carrier: carrier || undefined,
        mode,
        etd: etd || undefined,
        eta: eta || undefined,
      })
      setCarrier('')
      setEtd('')
      setEta('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not book the shipment.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDispatch(shipment: Shipment) {
    setError(null)
    try {
      await api.patch(`/shipments/${shipment.id}`, { actual_dispatch_date: new Date().toISOString().slice(0, 10) })
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record dispatch.')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Shipment</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-3 space-y-2">
        {shipments?.map((s) => (
          <div key={s.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <p className="text-slate-700">
              {s.carrier ?? 'Carrier TBD'} · {s.mode ?? '—'} {s.etd && `· ETD ${s.etd}`} {s.eta && `· ETA ${s.eta}`}
            </p>
            {s.actual_dispatch_date ? (
              <p className="mt-1 text-xs font-medium text-emerald-700">Dispatched {s.actual_dispatch_date}</p>
            ) : (
              canEdit && (
                <button type="button" onClick={() => handleDispatch(s)} className="mt-1 text-xs font-medium text-brand-600 hover:underline">
                  Mark dispatched today
                </button>
              )
            )}
          </div>
        ))}
        {shipments?.length === 0 && <p className="text-sm text-slate-400">No shipment booked yet.</p>}
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Carrier"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-32"
          />
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="sea">Sea</option>
            <option value="air">Air</option>
            <option value="road">Road</option>
          </select>
          <input type="date" placeholder="ETD" value={etd} onChange={(e) => setEtd(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" placeholder="ETA" value={eta} onChange={(e) => setEta(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Book shipment
          </button>
        </div>
      )}
    </div>
  )
}
