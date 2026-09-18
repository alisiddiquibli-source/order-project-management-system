import { useEffect, useState } from 'react'
import { AiReportsPanel } from '../components/AiReportsPanel'
import { AppShell } from '../components/AppShell'
import { OrderPortfolioTable, SummaryCard, loadPortfolio, type OrderWithStages } from '../components/OrderPortfolioTable'
import { api } from '../lib/api'
import type { AiReport, Project } from '../lib/types'

/**
 * Sales Manager's home view: full read visibility on every order across
 * their own projects (docs/ARCHITECTURE.md §7 — the server already scopes
 * `/orders` to projects they're the custodian of, nothing to filter here).
 */
export function SalesManagerDashboardPage() {
  const [orders, setOrders] = useState<OrderWithStages[] | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [aiReports, setAiReports] = useState<AiReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reloadAiReports() {
    setAiReports(await api.get<AiReport[]>('/ai-reports'))
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([loadPortfolio(api), api.get<Project[]>('/projects'), reloadAiReports()])
      .then(([portfolioData, projectsData]) => {
        if (!cancelled) {
          setOrders(portfolioData)
          setProjects(projectsData)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your projects. Please try again shortly.')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const atRiskCount = orders?.filter((o) => o.stages.some((s) => s.status === 'delayed' || s.status === 'blocked')).length ?? 0

  return (
    <AppShell title="My Projects">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Active orders" value={orders?.filter((o) => o.status === 'active').length ?? '—'} />
        <SummaryCard label="Needs attention" value={orders ? atRiskCount : '—'} tone={atRiskCount > 0 ? 'warning' : 'default'} />
        <SummaryCard label="Total orders" value={orders?.length ?? '—'} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {orders && <OrderPortfolioTable orders={orders} />}

      {projects && projects.length > 0 && (
        <div className="mt-4 space-y-4">
          {projects.map((project) => (
            <AiReportsPanel
              key={project.id}
              title={`AI status report — ${project.project_number}`}
              reports={aiReports?.filter((r) => r.project_id === project.id) ?? null}
              canGenerate
              generateLabel="Generate status report"
              onGenerate={() => api.post(`/projects/${project.id}/ai/status-report`).then(reloadAiReports)}
              onChanged={reloadAiReports}
            />
          ))}
        </div>
      )}
    </AppShell>
  )
}
