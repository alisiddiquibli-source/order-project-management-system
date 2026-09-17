import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { DocumentRecord, FatSatRecord, FatSatType, PunchListItem } from '../lib/types'

const RECORDER_ROLE: Record<FatSatType, string> = {
  FAT: 'project_coordinator',
  SAT: 'installation_engineer',
}

/**
 * Stage 5 (FAT) / stage 10 (SAT) evidence. A retest always creates a new
 * record rather than editing the old one — the superseded record and its
 * acceptance stop counting toward completion the moment a new one exists
 * (docs/ARCHITECTURE.md §3.3, FatSatRepository::create()).
 */
export function FatSatSection({
  orderId,
  orderStageId,
  stageId,
  type,
}: {
  orderId: number
  orderStageId: number
  stageId: number
  type: FatSatType
}) {
  const { user } = useAuth()
  const [records, setRecords] = useState<FatSatRecord[] | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canRecord = user?.role === RECORDER_ROLE[type]

  async function reload() {
    const [recs, docs] = await Promise.all([
      api.get<FatSatRecord[]>(`/orders/${orderId}/stages/${stageId}/fat-sat`),
      api.get<DocumentRecord[]>(`/orders/${orderId}/documents`),
    ])
    setRecords(recs)
    setDocuments(docs.filter((d) => d.order_stage_id === orderStageId))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load FAT/SAT records.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderStageId, stageId])

  const current = records?.find((r) => r.superseded_by === null) ?? null
  const history = records?.filter((r) => r.superseded_by !== null) ?? []

  async function startAttempt() {
    setError(null)
    try {
      await api.post(`/orders/${orderId}/stages/${stageId}/fat-sat`, { type })
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the attempt.')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{type}</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {current ? (
        <CurrentAttempt
          record={current}
          documents={documents ?? []}
          canRecord={canRecord}
          onChanged={reload}
          onRetest={startAttempt}
        />
      ) : (
        canRecord && (
          <button
            type="button"
            onClick={startAttempt}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Schedule {type}
          </button>
        )
      )}

      {history.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Previous attempts</p>
          {history.map((r) => (
            <p key={r.id} className="text-xs text-slate-500">
              #{r.id} · {r.result ?? 'no result recorded'} · superseded
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function CurrentAttempt({
  record,
  documents,
  canRecord,
  onChanged,
  onRetest,
}: {
  record: FatSatRecord
  documents: DocumentRecord[]
  canRecord: boolean
  onChanged: () => Promise<void>
  onRetest: () => Promise<void>
}) {
  const [result, setResult] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [reportDocumentId, setReportDocumentId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRecordResult() {
    if (result === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.patch(`/fat-sat/${record.id}/result`, {
        result,
        notes: notes || undefined,
        report_document_id: reportDocumentId ? Number(reportDocumentId) : undefined,
      })
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the result.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <p className="text-slate-700">
          Scheduled: {record.scheduled_date ?? '—'} · Actual: {record.actual_date ?? '—'}
        </p>
        {record.result && (
          <p className="mt-1 font-medium text-slate-900">
            Result: {record.result}
            {record.notes && <span className="font-normal text-slate-600"> — {record.notes}</span>}
          </p>
        )}
      </div>

      {canRecord && !record.result && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={result} onChange={(e) => setResult(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Record result…</option>
              <option value="pass">Pass</option>
              <option value="conditional_pass">Conditional pass</option>
              <option value="fail">Fail</option>
            </select>
            <select
              value={reportDocumentId}
              onChange={(e) => setReportDocumentId(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No report document</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.type}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleRecordResult}
              disabled={submitting || result === ''}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Record result
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {canRecord && record.result === 'fail' && (
        <button type="button" onClick={onRetest} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
          Start a retest
        </button>
      )}

      <PunchList fatSatRecordId={record.id} canManage={canRecord} />
    </div>
  )
}

function PunchList({ fatSatRecordId, canManage }: { fatSatRecordId: number; canManage: boolean }) {
  const [items, setItems] = useState<PunchListItem[] | null>(null)
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'critical' | 'minor'>('minor')
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setItems(await api.get<PunchListItem[]>(`/fat-sat/${fatSatRecordId}/punch-items`))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load the punch list.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fatSatRecordId])

  async function handleAdd() {
    if (description.trim() === '') return
    setError(null)
    try {
      await api.post(`/fat-sat/${fatSatRecordId}/punch-items`, { description, severity })
      setDescription('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the punch-list item.')
    }
  }

  async function handleResolve(id: number) {
    setError(null)
    try {
      await api.patch(`/punch-items/${id}/resolve`)
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resolve the item.')
    }
  }

  return (
    <div className="rounded-md border border-dashed border-slate-300 p-2">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Punch list</p>
      {error && <p className="mb-1.5 text-sm text-red-600">{error}</p>}
      <div className="mb-2 space-y-1">
        {items?.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-sm">
            <span className={item.status === 'resolved' ? 'text-slate-400 line-through' : 'text-slate-700'}>
              [{item.severity}] {item.description}
            </span>
            {canManage && item.status === 'open' && (
              <button type="button" onClick={() => handleResolve(item.id)} className="shrink-0 text-brand-600 hover:underline">
                Resolve
              </button>
            )}
          </div>
        ))}
        {items?.length === 0 && <p className="text-sm text-slate-400">No punch-list items.</p>}
      </div>
      {canManage && (
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <select value={severity} onChange={(e) => setSeverity(e.target.value as 'critical' | 'minor')} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="minor">Minor</option>
            <option value="critical">Critical</option>
          </select>
          <input
            type="text"
            placeholder="Describe the punch-list item…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button type="button" onClick={handleAdd} disabled={description.trim() === ''} className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            Add punch item
          </button>
        </div>
      )}
    </div>
  )
}
