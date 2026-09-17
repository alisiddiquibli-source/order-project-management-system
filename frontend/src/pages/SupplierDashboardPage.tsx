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
 * Supplier's home view: every order linked to their company, across every
 * project (docs/ARCHITECTURE.md §7). Commercial fields (contract value,
 * currency, customer identity) are stripped server-side for this role
 * (§6) — nothing to hide client-side, the API response itself never
 * includes them.
 */
export function SupplierDashboardPage() {
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
    <AppShell title="Our Orders">
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
                  </tr>
                )
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
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
