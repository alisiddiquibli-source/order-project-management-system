import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { StatusBadge } from '../components/StatusBadge'
import { api } from '../lib/api'
import type { Order, OrderStage } from '../lib/types'

interface OrderRow extends Order {
  currentStage: OrderStage | null
}

/**
 * Project Coordinator's home view: today's actions first (§11.1) — the
 * order and its current stage they need to move forward, not a generic
 * table dump of everything.
 */
export function CoordinatorDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const baseOrders = await api.get<Order[]>('/orders')
        const withCurrentStage = await Promise.all(
          baseOrders
            .filter((o) => o.status === 'active')
            .map(async (order) => {
              const stages = await api.get<OrderStage[]>(`/orders/${order.id}/stages`)
              return { ...order, currentStage: stages.find((s) => s.status !== 'completed') ?? null }
            }),
        )
        if (!cancelled) setOrders(withCurrentStage)
      } catch {
        if (!cancelled) setError('Could not load your orders. Please try again shortly.')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const needsAttention = orders?.filter((o) => o.currentStage?.status === 'delayed' || o.currentStage?.status === 'blocked') ?? []
  const onTrack = orders?.filter((o) => !needsAttention.includes(o)) ?? []

  return (
    <AppShell title="My Orders">
      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {orders && (
        <div className="space-y-6">
          {needsAttention.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-amber-700">Needs attention ({needsAttention.length})</h2>
              <OrderList orders={needsAttention} />
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">On track ({onTrack.length})</h2>
            {onTrack.length > 0 ? <OrderList orders={onTrack} /> : <p className="text-sm text-slate-400">Nothing else active right now.</p>}
          </section>
        </div>
      )}
    </AppShell>
  )
}

function OrderList({ orders }: { orders: OrderRow[] }) {
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {orders.map((order) => (
        <Link
          key={order.id}
          to={`/orders/${order.id}`}
          className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
        >
          <div>
            <p className="font-medium text-slate-900">
              {order.order_number} · {order.machine_name}
            </p>
            <p className="text-sm text-slate-500">{order.currentStage ? order.currentStage.stage_name : 'All stages complete'}</p>
          </div>
          {order.currentStage && <StatusBadge status={order.currentStage.status} />}
        </Link>
      ))}
    </div>
  )
}
