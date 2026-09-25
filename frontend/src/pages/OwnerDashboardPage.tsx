import { useEffect, useState } from 'react'
import { AiReportsPanel } from '../components/AiReportsPanel'
import { AppShell } from '../components/AppShell'
import { SummaryCard } from '../components/OrderPortfolioTable'
import { ProjectPortfolioView, loadPortfolioGrouped, type OrderWithStages } from '../components/ProjectPortfolioView'
import { api } from '../lib/api'
import type { AiReport, Project } from '../lib/types'

export function OwnerDashboardPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [orders, setOrders] = useState<OrderWithStages[] | null>(null)
  const [aiReports, setAiReports] = useState<AiReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reloadAiReports() {
    const all = await api.get<AiReport[]>('/ai-reports')
    setAiReports(all.filter((r) => r.order_id === null && r.project_id === null))
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([loadPortfolioGrouped(api), reloadAiReports()])
      .then(([{ projects: p, orders: o }]) => {
        if (!cancelled) {
          setProjects(p)
          setOrders(o)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the portfolio. Please try again shortly.')
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const atRiskCount = orders?.filter((o) => o.stages.some((s) => s.status === 'delayed' || s.status === 'blocked')).length ?? 0

  return (
    <AppShell title="Portfolio">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard label="Projects" value={projects?.length ?? '—'} />
        <SummaryCard label="Active orders" value={orders?.filter((o) => o.status === 'active').length ?? '—'} />
        <SummaryCard label="Needs attention" value={orders ? atRiskCount : '—'} tone={atRiskCount > 0 ? 'warning' : 'default'} />
        <SummaryCard label="Total orders" value={orders?.length ?? '—'} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {projects && orders && <ProjectPortfolioView projects={projects} orders={orders} />}

      <div className="mt-4">
        <AiReportsPanel
          title="AI portfolio advisory"
          reports={aiReports}
          canGenerate
          generateLabel="Generate portfolio advisory"
          onGenerate={() => api.post('/ai/portfolio-advisory').then(reloadAiReports)}
          onChanged={reloadAiReports}
        />
      </div>
    </AppShell>
  )
}
