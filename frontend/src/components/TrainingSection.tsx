import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { TrainingAttendee, TrainingRecord } from '../lib/types'

/**
 * Stage 11 evidence: the Engineer's training record (attendees summary
 * required) plus structured customer-staff detail per attendee — who to
 * actually contact after handover, not just a name in a paragraph.
 */
export function TrainingSection({ orderId, stageId }: { orderId: number; stageId: number }) {
  const { user } = useAuth()
  const [records, setRecords] = useState<TrainingRecord[] | null>(null)
  const [attendeeDetails, setAttendeeDetails] = useState<TrainingAttendee[] | null>(null)
  const [attendees, setAttendees] = useState('')
  const [materialsProvided, setMaterialsProvided] = useState('')
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('')
  const [designation, setDesignation] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
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

  // Backend returns these newest-first (ORDER BY id DESC) — index 0 is
  // latest, not the last array element (see the same fix in AcceptanceSection).
  const latest = records?.[0] ?? null

  async function reloadAttendees(trainingRecordId: number) {
    setAttendeeDetails(await api.get<TrainingAttendee[]>(`/training-records/${trainingRecordId}/attendees`))
  }

  useEffect(() => {
    if (latest) {
      reloadAttendees(latest.id).catch(() => setError('Could not load attendee details.'))
    } else {
      setAttendeeDetails(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id])

  async function handleAddAttendee() {
    if (!latest || name.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/training-records/${latest.id}/attendees`, {
        name,
        department: department || undefined,
        designation: designation || undefined,
        phone: phone || undefined,
        email: email || undefined,
      })
      setName('')
      setDepartment('')
      setDesignation('')
      setPhone('')
      setEmail('')
      await reloadAttendees(latest.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the attendee.')
    } finally {
      setSubmitting(false)
    }
  }

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

      {latest && (
        <div className="mb-3">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Customer staff attendees
          </h4>
          <div className="mb-2 space-y-1.5">
            {attendeeDetails?.map((a) => (
              <div key={a.id} className="rounded-md bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                <span className="font-medium text-slate-900">{a.name}</span>
                {a.designation && ` — ${a.designation}`}
                {a.department && ` (${a.department})`}
                {(a.phone || a.email) && (
                  <span className="text-slate-500">
                    {' · '}
                    {[a.phone, a.email].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            ))}
            {attendeeDetails?.length === 0 && (
              <p className="text-sm text-slate-400">No attendee details recorded yet — required before this stage can be marked complete.</p>
            )}
          </div>

          {canSubmit && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Cell phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddAttendee}
                  disabled={submitting || name.trim() === ''}
                  className="shrink-0 rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
