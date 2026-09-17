import { useEffect, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { OrderPortfolioTable, SummaryCard, loadPortfolio, type OrderWithStages } from '../components/OrderPortfolioTable'
import { api } from '../lib/api'

const LOGISTICS_STAGE_IDS = [6, 7, 8] // Shipment, import clearance, delivery — §7/§8

/**
 * Import Manager's home view: global read visibility, with the logistics
 * stages (shipment coordination through delivery) surfaced first — that's
 * the window they actually engage in (docs/ARCHITECTURE.md §7/§8).
 */
export function ImportManagerDashboardPage() {
  const [orders, setOrders] = useState<OrderWithStages[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    loadPortfolio(api)
      .then((data) => {
        if (!cancelled) setOrders(data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load orders. Please try again shortly.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const inLogistics =
    orders?.filter((o) => o.stages.some((s) => LOGISTICS_STAGE_IDS.includes(s.stage_id) && s.status !== 'completed' && s.status !== 'not_started')) ?? []

  return (
    <AppShell title="Import & Logistics">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard label="In shipment/import/delivery" value={orders ? inLogistics.length : '—'} />
        <SummaryCard label="Total orders" value={orders?.length ?? '—'} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {orders && (
        <div className="space-y-6">
          {inLogistics.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Currently in shipment/import/delivery</h2>
              <OrderPortfolioTable orders={inLogistics} />
            </section>
          )}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">All orders</h2>
            <OrderPortfolioTable orders={orders} />
          </section>
        </div>
      )}
    </AppShell>
  )
}
