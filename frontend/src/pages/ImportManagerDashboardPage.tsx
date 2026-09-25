import { useEffect, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { SummaryCard } from '../components/OrderPortfolioTable'
import { ProjectPortfolioView, loadPortfolioGrouped, type OrderWithStages } from '../components/ProjectPortfolioView'
import { api } from '../lib/api'
import type { Project } from '../lib/types'

const LOGISTICS_STAGE_IDS = [6, 7, 8]

export function ImportManagerDashboardPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [orders, setOrders] = useState<OrderWithStages[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    loadPortfolioGrouped(api)
      .then(({ projects: p, orders: o }) => {
        if (!cancelled) {
          setProjects(p)
          setOrders(o)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load orders. Please try again shortly.')
      })

    return () => { cancelled = true }
  }, [])

  const inLogistics =
    orders?.filter((o) => o.stages.some((s) => LOGISTICS_STAGE_IDS.includes(s.stage_id) && s.status !== 'completed' && s.status !== 'not_started')).length ?? 0

  return (
    <AppShell title="Import & Logistics">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard label="In shipment/import/delivery" value={orders ? inLogistics : '—'} />
        <SummaryCard label="Total orders" value={orders?.length ?? '—'} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {projects && orders && <ProjectPortfolioView projects={projects} orders={orders} />}
    </AppShell>
  )
}
