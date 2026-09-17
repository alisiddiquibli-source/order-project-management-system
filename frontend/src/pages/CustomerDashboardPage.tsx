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
 * Customer's home view: every order in their project (docs/ARCHITECTURE.md
 * §7 — one customer login per project, scoped server-side). Comments and
 * raising a service ticket live on the order detail page, not here.
 */
export function CustomerDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const baseOrders = await api.get<Order[]>('/orders')
      const withStages = await Promise.all(
        baseOrders.map(async (order) => ({
          ...order,
          stages: await api.get<OrderStage[]>(`/orders/${order.id}/stages`),
        })),
      )
      if (!cancelled) setOrders(withStages)
    }

    load().catch(() => {
      if (!cancelled) setError('Could not load your orders. Please try again shortly.')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppShell title="Your Orders">
      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {orders && (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {orders.map((order) => {
            const completed = order.stages.filter((s) => s.status === 'completed').length
            const current = order.stages.find((s) => s.status !== 'completed')
            return (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {order.order_number} · {order.machine_name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {current ? current.stage_name : 'All stages complete'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <ProgressBar completed={completed} total={order.stages.length} />
                  {current ? <StatusBadge status={current.status} /> : <StatusBadge status="completed" />}
                </div>
              </Link>
            )
          })}
          {orders.length === 0 && <p className="px-4 py-8 text-center text-slate-400">No orders yet.</p>}
        </div>
      )}
    </AppShell>
  )
}
