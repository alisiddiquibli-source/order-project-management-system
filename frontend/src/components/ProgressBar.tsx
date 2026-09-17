export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-status-completed transition-all" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-500">
        {completed}/{total}
      </span>
    </div>
  )
}
