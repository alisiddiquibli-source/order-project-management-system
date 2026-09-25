import { Link } from 'react-router-dom'
import type { Order, OrderStage, Project } from '../lib/types'
import { ProgressBar } from './ProgressBar'
import { StatusBadge } from './StatusBadge'

export interface OrderWithStages extends Order {
  stages: OrderStage[]
}

interface ProjectWithOrders extends Project {
  orders: OrderWithStages[]
}

export function ProjectPortfolioView({ projects, orders }: { projects: Project[]; orders: OrderWithStages[] }) {
  const grouped: ProjectWithOrders[] = projects.map((p) => ({
    ...p,
    orders: orders.filter((o) => o.project_id === p.id),
  }))

  const orphanOrders = orders.filter((o) => !projects.some((p) => p.id === o.project_id))

  return (
    <div className="space-y-4">
      {grouped.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
      {orphanOrders.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500">Other orders</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {orphanOrders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: ProjectWithOrders }) {
  const totalStages = project.orders.reduce((sum, o) => sum + (o.stages.length || 12), 0)
  const completedStages = project.orders.reduce((sum, o) => sum + o.stages.filter((s) => s.status === 'completed').length, 0)
  const activeOrders = project.orders.filter((o) => o.status === 'active').length
  const completedOrders = project.orders.filter((o) => o.status === 'completed').length

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      {/* Project header */}
      <Link
        to={`/projects/${project.id}`}
        className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
              <path d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9C21 7.89543 20.1046 7 19 7H13L11 5H5C3.89543 5 3 5.89543 3 7Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-slate-900">{project.title}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColors[project.status] ?? 'bg-slate-100 text-slate-600'}`}>
                {project.status}
              </span>
            </div>
            <p className="text-xs text-slate-500">{project.project_number} · {project.customer_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {activeOrders > 0 && (
              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                {activeOrders} active
              </span>
            )}
            {completedOrders > 0 && (
              <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                {completedOrders} done
              </span>
            )}
          </div>
          <div className="hidden sm:block">
            <ProgressBar completed={completedStages} total={totalStages} />
          </div>
        </div>
      </Link>

      {/* Order rows */}
      {project.orders.length > 0 ? (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {project.orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      ) : (
        <div className="border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-400">No machines (orders) yet</p>
        </div>
      )}
    </div>
  )
}

function OrderRow({ order }: { order: OrderWithStages }) {
  const completed = order.stages.filter((s) => s.status === 'completed').length
  const total = order.stages.length || 12
  const current = order.stages.find((s) => s.status !== 'completed' && s.status !== 'not_started')
    ?? order.stages.find((s) => s.status === 'not_started')
  const allComplete = completed === total && total > 0

  const statusColors: Record<string, string> = {
    active: 'text-emerald-600',
    on_hold: 'text-amber-600',
    cancelled: 'text-red-600',
    completed: 'text-blue-600',
  }

  return (
    <Link
      to={`/orders/${order.id}`}
      className="flex flex-col gap-3 px-5 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-brand-600">{order.order_number}</span>
            <span className="truncate text-sm text-slate-700">{order.machine_name}</span>
            <span className={`text-[11px] font-medium ${statusColors[order.status] ?? 'text-slate-500'}`}>
              {order.status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            {order.project_coordinator_name && <span>PC: {order.project_coordinator_name}</span>}
            <span>Target: {formatDate(order.target_handover_date)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:min-w-[220px] sm:justify-end">
        <ProgressBar completed={completed} total={total} />
        {order.status === 'completed' ? (
          <span className="text-xs font-medium text-blue-600">Closed</span>
        ) : allComplete ? (
          <span className="text-xs font-medium text-amber-600">Closeout needed</span>
        ) : current ? (
          <div className="hidden items-center gap-1.5 lg:flex">
            <span className="max-w-[120px] truncate text-xs text-slate-500">{current.stage_name}</span>
            <StatusBadge status={current.status} />
          </div>
        ) : null}
      </div>
    </Link>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export async function loadPortfolioGrouped(
  api: { get: <T>(path: string) => Promise<T> },
): Promise<{ projects: Project[]; orders: OrderWithStages[] }> {
  const [projects, baseOrders] = await Promise.all([
    api.get<Project[]>('/projects'),
    api.get<Order[]>('/orders'),
  ])
  const orders = await Promise.all(
    baseOrders.map(async (order) => ({
      ...order,
      stages: await api.get<OrderStage[]>(`/orders/${order.id}/stages`),
    })),
  )
  return { projects, orders }
}
