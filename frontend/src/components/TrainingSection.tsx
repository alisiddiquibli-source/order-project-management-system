import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { TrainingRecord } from '../lib/types'

/** Stage 11 evidence: the Engineer's training record (attendees required). */
export function TrainingSection({ orderId, stageId }: { orderId: number; stageId: number }) {
  const { user } = useAuth()
  const [records, setRecords] = useState<TrainingRecord[] | null>(null)
  const [attendees, setAttendees] = useState('')
  const [materialsProvided, setMaterialsProvided] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = user?.role === 'installation_engineer'

  async function reload() {
    setRecords(await api.get<TrainingRecord[]>(`/orders/${orderId}/stages/${stageId}/training`))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load training records.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId])

  async function handleSubmit() {
    if (attendees.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/stages/${stageId}/training`, {
        attendees,
        actual_date: new Date().toISOString().slice(0, 10),
        materials_provided: materialsProvided || undefined,
      })
      setAttendees('')
      setMaterialsProvided('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the training record.')
    } finally {
      setSubmitting(false)
    }
  }

  const latest = records?.[records.length - 1] ?? null

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Training</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {latest && (
        <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <p className="text-slate-700">
            Attendees: {latest.attendees} {latest.actual_date && `· ${latest.actual_date}`}
          </p>
          {latest.materials_provided && <p className="mt-1 text-slate-600">Materials: {latest.materials_provided}</p>}
        </div>
      )}
      {records?.length === 0 && <p className="mb-3 text-sm text-slate-400">No training recorded yet.</p>}

      {canSubmit && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Attendees"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Materials provided (optional)"
            value={materialsProvided}
            onChange={(e) => setMaterialsProvided(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || attendees.trim() === ''}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Submit training record
          </button>
        </div>
      )}
    </div>
  )
}
