import type { StageStatus } from '../lib/types'

const LABELS: Record<StageStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  delayed: 'Delayed',
  blocked: 'Blocked',
}

const DOT_CLASSES: Record<StageStatus, string> = {
  not_started: 'bg-status-not_started',
  in_progress: 'bg-status-in_progress',
  completed: 'bg-status-completed',
  delayed: 'bg-status-delayed',
  blocked: 'bg-status-blocked',
}

const TEXT_CLASSES: Record<StageStatus, string> = {
  not_started: 'text-slate-600',
  in_progress: 'text-blue-700',
  completed: 'text-emerald-700',
  delayed: 'text-amber-700',
  blocked: 'text-red-700',
}

/**
 * The one place stage/order status renders — used everywhere, so status
 * reads identically across every screen (docs/ARCHITECTURE.md §11.1: never
 * ambiguous, never purely textual).
 */
export function StatusBadge({ status }: { status: StageStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${TEXT_CLASSES[status]}`}>
      <span className={`h-2 w-2 rounded-full ${DOT_CLASSES[status]}`} aria-hidden="true" />
      {LABELS[status]}
    </span>
  )
}
