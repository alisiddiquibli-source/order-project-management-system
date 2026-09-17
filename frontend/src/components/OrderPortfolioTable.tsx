import { Link } from 'react-router-dom'
import type { Order, OrderStage } from '../lib/types'
import { ProgressBar } from './ProgressBar'
import { StatusBadge } from './StatusBadge'

export interface OrderWithStages extends Order {
  stages: OrderStage[]
}

/**
 * The read-oriented "every order I can see, at a glance" view shared by
 * Company Owner, Sales Manager, and Import Manager (docs/ARCHITECTURE.md
 * §7) — each role's dashboard fetches its own already-scoped `/orders`
 * list server-side and just renders it through here, rather than three
 * near-identical copies of this table.
 */
export function OrderPortfolioTable({ orders }: { orders: OrderWithStages[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Order</th>
            <th className="px-4 py-3 font-medium">Machine</th>
            <th className="px-4 py-3 font-medium">Progress</th>
            <th className="px-4 py-3 font-medium">Current stage</th>
            <th className="px-4 py-3 font-medium">Target handover</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((order) => {
            const completed = order.stages.filter((s) => s.status === 'completed').length
            const current = order.stages.find((s) => s.status !== 'completed')
            return (
              <tr key={order.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                    {order.order_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{order.machine_name}</td>
                <td className="px-4 py-3">
                  <ProgressBar completed={completed} total={order.stages.length} />
                </td>
                <td className="px-4 py-3">
                  {current ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-700">{current.stage_name}</span>
                      <StatusBadge status={current.status} />
                    </div>
                  ) : (
                    <StatusBadge status="completed" />
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{order.target_handover_date}</td>
              </tr>
            )
          })}
          {orders.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                No orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number | string
  tone?: 'default' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === 'warning' && value !== 0 ? 'text-amber-600' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  )
}

/**
 * Shared data load: every order this user can see, each with its stages
 * attached (client-side aggregation until a dedicated summary endpoint
 * exists — docs/ROADMAP.md).
 */
export async function loadPortfolio(
  api: { get: <T>(path: string) => Promise<T> },
): Promise<OrderWithStages[]> {
  const baseOrders = await api.get<Order[]>('/orders')
  return Promise.all(
    baseOrders.map(async (order) => ({
      ...order,
      stages: await api.get<OrderStage[]>(`/orders/${order.id}/stages`),
    })),
  )
}
