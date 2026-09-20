import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Project } from '../lib/types'

/**
 * Project creation, open to whoever originates or runs the deal (Sales
 * Manager, Project Coordinator, or the Owner) — deletion stays
 * Owner-only, since it's rare and consequential enough to keep to one
 * role (backend enforces both; this just doesn't render what the server
 * would reject anyway).
 */
export function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [projectNumber, setProjectNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [title, setTitle] = useState('')
  const [salesManagerId, setSalesManagerId] = useState('')
  const [projectCoordinatorId, setProjectCoordinatorId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canCreate = user && ['sales_manager', 'project_coordinator', 'company_owner'].includes(user.role)
  const canDelete = user?.role === 'company_owner'

  async function reload() {
    setProjects(await api.get<Project[]>('/projects'))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load projects.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/projects', {
        project_number: projectNumber,
        customer_name: customerName,
        title,
        sales_manager_id: Number(salesManagerId),
        project_coordinator_id: Number(projectCoordinatorId),
      })
      setProjectNumber('')
      setCustomerName('')
      setTitle('')
      setSalesManagerId('')
      setProjectCoordinatorId('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the project.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(project: Project) {
    if (!window.confirm(`Delete project ${project.project_number} — ${project.title}? This cannot be undone.`)) {
      return
    }
    setError(null)
    try {
      await api.delete(`/projects/${project.id}`)
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the project.')
    }
  }

  return (
    <AppShell title="Projects">
      {error && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {canCreate && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Create a project</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input
              type="text"
              placeholder="Project number (e.g. PRJ-0007)"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Sales Manager user ID"
              value={salesManagerId}
              onChange={(e) => setSalesManagerId(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Project Coordinator user ID"
              value={projectCoordinatorId}
              onChange={(e) => setProjectCoordinatorId(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || !projectNumber || !customerName || !title || !salesManagerId || !projectCoordinatorId}
            className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Create project
          </button>
          {user?.role === 'company_owner' && (
            <p className="mt-2 text-xs text-slate-400">
              Look up user IDs on the <Link to="/users" className="underline">Manage users</Link> page.
            </p>
          )}
        </div>
      )}

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {projects?.map((project) => (
          <div key={project.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">
                {project.project_number} · {project.title}
              </p>
              <p className="text-sm text-slate-500">{project.customer_name}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{project.status}</span>
              {canDelete && (
                <button type="button" onClick={() => handleDelete(project)} className="text-xs font-medium text-red-600 hover:underline">
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
        {projects?.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No projects yet.</p>}
      </div>
    </AppShell>
  )
}
