import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { OrderStage, StageStatus } from '../lib/types'

/**
 * Who has to act to move each stage forward — role names only, never
 * individual staff (this renders for every role, including Customer/
 * Supplier, so it must never leak internal staffing — see
 * OrderDetailPage's separate, internal-only staffing row for names).
 * Matches docs/ARCHITECTURE.md §3.2 and StageCompletionEvaluator's actual
 * gates — kept in sync with that file, not a guess independent of it.
 */
const STAGE_RESPONSIBILITY: Record<number, string> = {
  1: 'Project Coordinator records it; Sales Manager or Owner approves it',
  2: 'Project Coordinator uploads the Purchase Order',
  3: 'Project Coordinator tracks manufacturing milestones to done',
  4: 'Project Coordinator confirms testing material coordination',
  5: 'Project Coordinator schedules and records the FAT result',
  6: 'Project Coordinator records the actual shipment dispatch',
  7: "Customer's import team clears customs; Import Manager/PC track it",
  8: "Customer's import team confirms delivery",
  9: 'Installation Engineer submits the installation report',
  10: 'Installation Engineer records the SAT result; Customer signs off',
  11: 'Installation Engineer records training; Customer acknowledges it',
  12: 'Installation Engineer submits handover readiness; Customer confirms handover',
}

const STATUS_STYLES: Record<StageStatus, { dot: string; ring: string; text: string }> = {
  not_started: { dot: 'bg-slate-300', ring: 'ring-slate-200', text: 'text-slate-500' },
  in_progress: { dot: 'bg-blue-500', ring: 'ring-blue-200', text: 'text-blue-700' },
  completed: { dot: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-emerald-700' },
  delayed: { dot: 'bg-amber-500', ring: 'ring-amber-200', text: 'text-amber-700' },
  blocked: { dot: 'bg-red-500', ring: 'ring-red-200', text: 'text-red-700' },
}

/**
 * At-a-glance visual pipeline: every stage as a connected node, colored by
 * status, with the current stage called out and — critically — a plain-
 * English note on who needs to act next and why it isn't moving yet. Built
 * after live testing showed the plain numbered list wasn't enough: a
 * blocked stage looked identical to a normal one until you expanded it and
 * read a database-flavored error message. Visible to every role that can
 * see the order at all, including Customer/Supplier — nothing rendered
 * here is more sensitive than a stage name and a role name.
 */
export function PipelineFlowchart({ orderId, stages }: { orderId: number; stages: OrderStage[] }) {
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence)
  const current = sorted.find((s) => s.status !== 'completed') ?? null

  const [blockedReason, setBlockedReason] = useState<string | null>(null)

  useEffect(() => {
    setBlockedReason(null)
    if (!current) return
    let cancelled = false
    api
      .get<{ ok: boolean; reason: string | null }>(`/orders/${orderId}/stages/${current.stage_id}/completion-status`)
      .then((result) => {
        if (!cancelled) setBlockedReason(result.ok ? null : result.reason)
      })
      .catch(() => {
        // A stalled flowchart note isn't worth an error banner — the
        // expandable stage list below still has the full picture.
      })
    return () => {
      cancelled = true
    }
  }, [orderId, current?.id, current?.stage_id])

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Pipeline</h2>

      <div className="flex flex-wrap items-center gap-y-4">
        {sorted.map((stage, i) => {
          const style = STATUS_STYLES[stage.status]
          const isCurrent = current?.id === stage.id
          return (
            <div key={stage.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1" title={stage.stage_name}>
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ring-4 ${style.dot} ${isCurrent ? 'ring-brand-200' : style.ring}`}
                >
                  {stage.sequence}
                </div>
                <span className={`w-20 text-center text-[10px] leading-tight ${isCurrent ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
                  {stage.stage_name}
                </span>
              </div>
              {i < sorted.length - 1 && <div className="mx-1 h-0.5 w-4 shrink-0 bg-slate-200 sm:w-8" />}
            </div>
          )
        })}
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        {current ? (
          <>
            <p className="text-sm">
              <span className="font-semibold text-slate-800">Current stage:</span>{' '}
              <span className={STATUS_STYLES[current.status].text}>
                {current.sequence}. {current.stage_name}
              </span>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">Responsible:</span> {STAGE_RESPONSIBILITY[current.stage_id] ?? '—'}
            </p>
            {blockedReason && (
              <p className="mt-1 text-sm text-amber-700">
                <span className="font-semibold">Next step:</span> {blockedReason}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-emerald-700">All 12 stages complete — this order has been handed over.</p>
        )}
      </div>
    </div>
  )
}
