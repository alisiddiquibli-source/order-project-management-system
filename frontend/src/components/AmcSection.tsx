import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { AmcContract, AmcVisit } from '../lib/types'

/**
 * AMC contracts/visits (docs/ARCHITECTURE.md §5) — post-handover,
 * managed directly by the Installation & Service Engineer, no PC
 * hand-off. Order-level, not tied to any of the 12 pipeline stages.
 */
export function AmcSection({ orderId }: { orderId: number }) {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<AmcContract[] | null>(null)
  const [visitsByContract, setVisitsByContract] = useState<Record<number, AmcVisit[]>>({})
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [frequency, setFrequency] = useState('quarterly')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canManage = user?.role === 'installation_engineer'

  async function reload() {
    const contractList = await api.get<AmcContract[]>(`/orders/${orderId}/amc-contracts`)
    setContracts(contractList)
    const visitEntries = await Promise.all(
      contractList.map(async (c) => [c.id, await api.get<AmcVisit[]>(`/amc-contracts/${c.id}/visits`)] as const),
    )
    setVisitsByContract(Object.fromEntries(visitEntries))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load AMC contracts.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function handleCreateContract() {
    if (!startDate || !endDate) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/amc-contracts`, { start_date: startDate, end_date: endDate, frequency })
      setStartDate('')
      setEndDate('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the AMC contract.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">AMC contracts</h2>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-4 space-y-3">
        {contracts?.map((contract) => (
          <AmcContractRow
            key={contract.id}
            contract={contract}
            visits={visitsByContract[contract.id] ?? []}
            canManage={canManage}
            onChanged={reload}
          />
        ))}
        {contracts?.length === 0 && <p className="text-sm text-slate-400">No AMC contract on this order yet.</p>}
      </div>

      {canManage && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="quarterly">Quarterly</option>
            <option value="biannual">Biannual</option>
            <option value="annual">Annual</option>
          </select>
          <button
            type="button"
            onClick={handleCreateContract}
            disabled={submitting || !startDate || !endDate}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Create contract
          </button>
        </div>
      )}
    </div>
  )
}

function AmcContractRow({
  contract,
  visits,
  canManage,
  onChanged,
}: {
  contract: AmcContract
  visits: AmcVisit[]
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const [scheduledDate, setScheduledDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAddVisit() {
    if (!scheduledDate) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/amc-contracts/${contract.id}/visits`, { scheduled_date: scheduledDate })
      setScheduledDate('')
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not schedule the visit.')
    } finally {
      setBusy(false)
    }
  }

  async function handleMarkVisited(visit: AmcVisit) {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/amc-visits/${visit.id}`, { actual_date: new Date().toISOString().slice(0, 10) })
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the visit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="font-medium text-slate-900">
        {contract.start_date} – {contract.end_date} · {contract.frequency}
      </p>
      {contract.coverage_terms && <p className="mt-1 text-sm text-slate-600">{contract.coverage_terms}</p>}

      <div className="mt-2 space-y-1">
        {visits.map((visit) => (
          <div key={visit.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-sm">
            <span className="text-slate-700">Scheduled {visit.scheduled_date}</span>
            {visit.actual_date ? (
              <span className="text-xs font-medium text-emerald-700">Visited {visit.actual_date}</span>
            ) : (
              canManage && (
                <button type="button" onClick={() => handleMarkVisited(visit)} disabled={busy} className="text-xs font-medium text-brand-600 hover:underline">
                  Mark visited today
                </button>
              )
            )}
          </div>
        ))}
        {visits.length === 0 && <p className="text-sm text-slate-400">No visits scheduled.</p>}
      </div>

      {canManage && (
        <div className="mt-2 flex gap-2">
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={handleAddVisit}
            disabled={busy || !scheduledDate}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Schedule visit
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
