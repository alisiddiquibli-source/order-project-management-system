import { useEffect, useState } from 'react'
import { DocumentPreview } from './DocumentPreview'
import { ApiError, api, downloadDocument } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { DocumentRecord } from '../lib/types'

/**
 * Document upload + list for one stage (docs/ARCHITECTURE.md §4.3.1).
 * Local files (including FAT/SAT photos/video) go through the
 * authenticated download endpoint and get an inline preview via
 * DocumentPreview. The architecture doc originally called for photo/video
 * to go to Google Drive instead, to avoid filling Bluehost's disk quota —
 * deliberately not built given actual volume (~15 files/month), which
 * local storage handles fine. Revisit if volume grows enough for that to
 * become a real risk; the backend already accepts `storage_type:
 * 'google_drive'` (a Drive file id as `file_path`), this form just
 * doesn't have the upload UI for it. It does support `storage_type:
 * 'link'` — a plain URL for a video/file already hosted elsewhere (e.g.
 * a FAT/SAT video someone uploaded to YouTube themselves), which needs
 * no storage of ours at all.
 *
 * @param suggestedType pre-fills the type field for stages with one
 *   canonical document (e.g. 'PO' for stage 2) — still editable, since a
 *   stage can carry more than one kind of document.
 */
export function DocumentsSection({
  orderId,
  orderStageId,
  suggestedType,
  title = 'Documents',
  onUploaded,
}: {
  orderId: number
  orderStageId: number
  suggestedType: string
  title?: string
  /** Notifies a sibling that reads the same order's documents (e.g. FatSatSection's
   *  report-document picker) that a new one exists — they don't share state otherwise. */
  onUploaded?: () => void
}) {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null)
  const [type, setType] = useState(suggestedType)
  const [file, setFile] = useState<File | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canUpload = user && ['project_coordinator', 'installation_engineer'].includes(user.role)

  async function reload() {
    const all = await api.get<DocumentRecord[]>(`/orders/${orderId}/documents`)
    setDocuments(all.filter((d) => d.order_stage_id === orderStageId))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load documents.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderStageId])

  async function handleUpload() {
    if (!file || type.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('type', type)
      formData.append('storage_type', 'local')
      formData.append('order_stage_id', String(orderStageId))
      formData.append('file', file)
      await api.post(`/orders/${orderId}/documents`, formData)
      setFile(null)
      await reload()
      onUploaded?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the document.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddLink() {
    if (linkUrl.trim() === '' || type.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/documents`, {
        type,
        storage_type: 'link',
        order_stage_id: orderStageId,
        file_path: linkUrl.trim(),
      })
      setLinkUrl('')
      await reload()
      onUploaded?.()
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
    <div className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>

      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-3 space-y-1.5">
        {documents?.map((doc) => (
          <div key={doc.id} className="rounded-md bg-slate-50 px-3 py-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-700">{doc.type}</span>
              {doc.storage_type === 'google_drive' ? (
                <a
                  href={`https://drive.google.com/file/d/${doc.file_path}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  View in Drive
                </a>
              ) : doc.storage_type === 'link' ? (
                <a href={doc.file_path} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  Open link
                </a>
              ) : (
                <button type="button" onClick={() => handleDownload(doc)} className="text-brand-600 hover:underline">
                  Download
                </button>
              )}
            </div>
            <DocumentPreview document={doc} className="mt-1.5 max-h-40 rounded-md border border-slate-200 object-cover" />
          </div>
        ))}
        {documents?.length === 0 && <p className="text-sm text-slate-400">No documents yet.</p>}
      </div>

      {canUpload && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Document type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-40"
          />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={submitting || !file}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Upload
          </button>
        </div>
      )}

      {canUpload && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <span className="self-center text-xs text-slate-400 sm:w-40">Or a link (e.g. YouTube video):</span>
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
            disabled={submitting || linkUrl.trim() === ''}
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Add link
          </button>
        </div>
      )}
    </div>
  )
}
