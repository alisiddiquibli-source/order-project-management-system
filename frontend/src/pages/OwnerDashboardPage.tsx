import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import { api } from '../lib/api'
import type { Order, OrderStage } from '../lib/types'

interface OrderRow extends Order {
  stages: OrderStage[]
}

/**
 * Company Owner's home view: portfolio-wide, every order, at-a-glance
 * status — leads with what this role needs first (§11.1). Dedicated
 * summary/aggregation endpoints are a known follow-up (docs/ROADMAP.md);
 * this fetches per-order stage lists client-side in the meantime.
 */
export function OwnerDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const baseOrders = await api.get<Order[]>('/orders')
        const withStages = await Promise.all(
          baseOrders.map(async (order) => ({
            ...order,
            stages: await api.get<OrderStage[]>(`/orders/${order.id}/stages`),
          })),
        )
        if (!cancelled) setOrders(withStages)
      } catch {
        if (!cancelled) setError('Could not load the portfolio. Please try again shortly.')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const atRiskCount = orders?.filter((o) => o.stages.some((s) => s.status === 'delayed' || s.status === 'blocked')).length ?? 0

  return (
    <AppShell title="Portfolio">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Active orders" value={orders?.filter((o) => o.status === 'active').length ?? '—'} />
        <SummaryCard label="Needs attention" value={orders ? atRiskCount : '—'} tone={atRiskCount > 0 ? 'warning' : 'default'} />
        <SummaryCard label="Total orders" value={orders?.length ?? '—'} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {orders && (
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
      )}
    </AppShell>
  )
}

function SummaryCard({
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
