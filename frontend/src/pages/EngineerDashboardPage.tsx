import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { StatusBadge } from '../components/StatusBadge'
import { api } from '../lib/api'
import type { AmcContract, AmcVisit, Order, OrderStage, ServiceTicket } from '../lib/types'

interface OrderRow extends Order {
  currentStage: OrderStage | null
}

/**
 * Installation & Service Engineer's home view: assigned orders (stage
 * 9-12 focus) plus the post-handover workload that's theirs alone to run
 * — open tickets and upcoming/overdue AMC visits (docs/ARCHITECTURE.md §5,
 * §7). No dedicated "my visits due" endpoint exists yet (only the Owner's
 * portfolio-wide one), so visits are aggregated client-side from this
 * engineer's own orders' AMC contracts.
 */
export function EngineerDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [tickets, setTickets] = useState<ServiceTicket[] | null>(null)
  const [dueVisits, setDueVisits] = useState<AmcVisit[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const baseOrders = await api.get<Order[]>('/orders')
      const withCurrentStage = await Promise.all(
        baseOrders.map(async (order) => {
          const stages = await api.get<OrderStage[]>(`/orders/${order.id}/stages`)
          return { ...order, currentStage: stages.find((s) => s.status !== 'completed') ?? null }
        }),
      )

      const openTickets = await api.get<ServiceTicket[]>('/service-tickets?status=open')
      const inProgressTickets = await api.get<ServiceTicket[]>('/service-tickets?status=in_progress')

      const visitsPerOrder = await Promise.all(
        baseOrders.map(async (order) => {
          const contracts = await api.get<AmcContract[]>(`/orders/${order.id}/amc-contracts`)
          const visits = await Promise.all(
            contracts.map((contract) => api.get<AmcVisit[]>(`/amc-contracts/${contract.id}/visits`)),
          )
          return visits.flat().map((v) => ({ ...v, order_id: order.id, order_number: order.order_number, machine_name: order.machine_name }))
        }),
      )
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() + 14)
      const upcoming = visitsPerOrder
        .flat()
        .filter((v) => v.actual_date === null && new Date(v.scheduled_date) <= cutoff)
        .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

      if (!cancelled) {
        setOrders(withCurrentStage)
        setTickets([...openTickets, ...inProgressTickets])
        setDueVisits(upcoming)
      }
    }

    load().catch(() => {
      if (!cancelled) setError('Could not load your dashboard. Please try again shortly.')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppShell title="My Work">
      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Open service tickets ({tickets?.length ?? '—'})</h2>
          {tickets && tickets.length > 0 ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/orders/${ticket.order_id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      #{ticket.id} · {ticket.type.replace('_', ' ')} · {ticket.severity}
                    </p>
                    <p className="text-sm text-slate-500">{ticket.description}</p>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{ticket.status.replace('_', ' ')}</span>
                </Link>
              ))}
            </div>
          ) : (
            tickets && <p className="text-sm text-slate-400">No open tickets right now.</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">AMC visits due soon or overdue</h2>
          {dueVisits && dueVisits.length > 0 ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {dueVisits.map((visit) => (
                <Link
                  key={visit.id}
                  to={`/orders/${visit.order_id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {visit.order_number} · {visit.machine_name}
                    </p>
                    <p className="text-sm text-slate-500">Scheduled {visit.scheduled_date}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            dueVisits && <p className="text-sm text-slate-400">Nothing due in the next 14 days.</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">My orders</h2>
          {orders && (
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
              {orders.length === 0 && <p className="px-4 py-8 text-center text-slate-400">No orders assigned.</p>}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
