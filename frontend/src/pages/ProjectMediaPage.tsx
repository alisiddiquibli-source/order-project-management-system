import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { DocumentPreview } from '../components/DocumentPreview'
import { ApiError, api, downloadDocument } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { DocumentRecord, Project } from '../lib/types'

/**
 * Project-wide media/document feed (docs/ARCHITECTURE.md §4.3.1 extension)
 * — everything attached to this project across all its orders, plus
 * general project-level uploads (walkthrough videos, site-survey photos)
 * that aren't tied to any one order/stage. Reuses the same local-storage +
 * authenticated-download model as stage documents; this is the private,
 * in-app answer to "host video/documents for this project" rather than a
 * separate blog/CMS on the same hosting account.
 */
export function ProjectMediaPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canUpload = user && ['project_coordinator', 'installation_engineer', 'sales_manager', 'company_owner'].includes(user.role)

  async function reload() {
    const [projectData, documentsData] = await Promise.all([
      api.get<Project>(`/projects/${id}`),
      api.get<DocumentRecord[]>(`/projects/${id}/documents`),
    ])
    setProject(projectData)
    setDocuments(documentsData)
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load this project\'s media.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleUpload() {
    if (!file || type.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('type', type)
      formData.append('file', file)
      await api.post(`/projects/${id}/documents`, formData)
      setType('')
      setFile(null)
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the file.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddLink() {
    if (linkUrl.trim() === '' || type.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/projects/${id}/documents`, {
        type,
        storage_type: 'link',
        file_path: linkUrl.trim(),
      })
      setType('')
      setLinkUrl('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the link.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDownload(doc: DocumentRecord) {
    try {
      await downloadDocument(doc.id, `${doc.type}-${doc.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not download the file.')
    }
  }

  return (
    <AppShell title={project ? `${project.project_number} · Media` : 'Project media'}>
      {error && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <p className="mb-4 text-sm text-slate-500">
        {project?.title} — every photo, video, and document attached to this project, across all its orders, newest
        first. <Link to="/projects" className="text-brand-600 hover:underline">Back to projects</Link>
      </p>

      {canUpload && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Add project media</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="e.g. site_survey, walkthrough_video"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-56"
            />
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleUpload}
              disabled={submitting || !file || type.trim() === ''}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Upload
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Not tied to a specific order or stage — for order/stage evidence (POs, FAT/SAT reports, etc.), upload from
            the order's own page instead.
          </p>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row">
            <span className="self-center text-xs text-slate-400 sm:w-56">Or a link (e.g. YouTube video):</span>
            <input
              type="url"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={submitting || linkUrl.trim() === '' || type.trim() === ''}
              className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Add link
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {documents?.map((doc) => (
          <div key={doc.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <DocumentPreview document={doc} className="h-48 w-full object-cover" />
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-900">{doc.type}</p>
                <p className="text-xs text-slate-400">{new Date(doc.created_at).toLocaleDateString()}</p>
              </div>
              {doc.storage_type === 'google_drive' ? (
                <a
                  href={`https://drive.google.com/file/d/${doc.file_path}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-brand-600 hover:underline"
                >
                  View in Drive
                </a>
              ) : doc.storage_type === 'link' ? (
                <a href={doc.file_path} target="_blank" rel="noreferrer" className="shrink-0 text-brand-600 hover:underline">
                  Open link
                </a>
              ) : (
                <button type="button" onClick={() => handleDownload(doc)} className="shrink-0 text-brand-600 hover:underline">
                  Download
                </button>
              )}
            </div>
          </div>
        ))}
        {documents?.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-slate-400">No media uploaded yet.</p>
        )}
      </div>
    </AppShell>
  )
}
