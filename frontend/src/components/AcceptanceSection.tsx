import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type {
  Acceptance,
  AcceptanceTargetTable,
  AcceptanceType,
  DocumentRecord,
  EngineerReport,
  FatSatRecord,
  TrainingRecord,
} from '../lib/types'

/**
 * The acceptance step for stages 5 (FAT, conditional-pass only)/10 (SAT)/
 * 11 (training)/12 (handover) — docs/ARCHITECTURE.md §3.4. Only Sales
 * Manager or Customer can record one; a Sales Manager's only counts as
 * genuine customer acceptance when it carries evidence of the customer's
 * own authorization (an uploaded document) — otherwise SAT/training/
 * handover stay blocked on it, by design (a Sales Manager alone can
 * proceed, but can't manufacture the customer's sign-off).
 */
export function AcceptanceSection({
  orderId,
  orderStageId,
  stageId,
  type,
  targetTable,
}: {
  orderId: number
  orderStageId: number
  stageId: number
  type: AcceptanceType
  targetTable: AcceptanceTargetTable
}) {
  const { user } = useAuth()
  const [acceptances, setAcceptances] = useState<Acceptance[] | null>(null)
  const [targetRecordId, setTargetRecordId] = useState<number | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null)
  const [evidenceDocId, setEvidenceDocId] = useState('')
  const [conditionsNotes, setConditionsNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRecord = user && ['sales_manager', 'customer'].includes(user.role)
  const needsEvidencePicker = user?.role === 'sales_manager'

  async function reload() {
    const [accs, docs] = await Promise.all([
      api.get<Acceptance[]>(`/orders/${orderId}/stages/${stageId}/acceptances`),
      api.get<DocumentRecord[]>(`/orders/${orderId}/documents`),
    ])
    setAcceptances(accs.filter((a) => a.type === type))
    setDocuments(docs.filter((d) => d.order_stage_id === orderStageId))

    let target: number | null = null
    if (targetTable === 'fat_sat_record') {
      const records = await api.get<FatSatRecord[]>(`/orders/${orderId}/stages/${stageId}/fat-sat`)
      target = records.find((r) => r.superseded_by === null)?.id ?? null
    } else if (targetTable === 'training_record') {
      const records = await api.get<TrainingRecord[]>(`/orders/${orderId}/stages/${stageId}/training`)
      target = records[records.length - 1]?.id ?? null
    } else {
      const reports = await api.get<EngineerReport[]>(`/orders/${orderId}/stages/${stageId}/engineer-reports`)
      target = reports.filter((r) => r.type === 'handover_readiness').slice(-1)[0]?.id ?? null
    }
    setTargetRecordId(target)
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load acceptance status.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, type])

  async function handleAccept() {
    if (targetRecordId === null) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/stages/${stageId}/acceptances`, {
        target_record_id: targetRecordId,
        customer_authorization_evidence_document_id: evidenceDocId ? Number(evidenceDocId) : undefined,
        conditions_notes: conditionsNotes || undefined,
      })
      setConditionsNotes('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the acceptance.')
    } finally {
      setSubmitting(false)
    }
  }

  const latest = acceptances?.[acceptances.length - 1] ?? null

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Acceptance</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {latest ? (
        <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <p className="font-medium text-slate-900">
            Accepted by {latest.accepted_by_type === 'customer' ? 'the customer' : 'a Sales Manager'}
            {latest.constitutes_customer_acceptance ? (
              <span className="ml-2 text-xs font-medium text-emerald-700">Genuine customer acceptance</span>
            ) : (
              <span className="ml-2 text-xs font-medium text-amber-700">Not yet customer-confirmed</span>
            )}
          </p>
          {latest.conditions_notes && <p className="mt-1 text-slate-600">{latest.conditions_notes}</p>}
        </div>
      ) : (
        <p className="mb-3 text-sm text-slate-400">Not accepted yet.</p>
      )}

      {canRecord && targetRecordId !== null && (
        <div className="space-y-2">
          {needsEvidencePicker && (
            <select
              value={evidenceDocId}
              onChange={(e) => setEvidenceDocId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No customer-authorization evidence (won't count as genuine customer acceptance)</option>
              {documents?.map((d) => (
                <option key={d.id} value={d.id}>
                  Evidence: {d.type}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Conditions / notes (optional)"
              value={conditionsNotes}
              onChange={(e) => setConditionsNotes(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleAccept}
              disabled={submitting}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Accept
            </button>
          </div>
        </div>
      )}
      {canRecord && targetRecordId === null && (
        <p className="text-sm text-slate-400">Nothing ready to accept yet for this stage.</p>
      )}
    </div>
  )
}
