import { useEffect, useState } from 'react'
import { ApiError, api, downloadDocument } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { DocumentRecord } from '../lib/types'

/**
 * Document upload + list for one stage (docs/ARCHITECTURE.md §4.3.1).
 * Local files go through the authenticated download endpoint; this form
 * only covers local uploads. The architecture doc originally called for
 * FAT/SAT photos/video to go to Google Drive instead, to avoid filling
 * Bluehost's disk quota — deliberately not built given actual volume
 * (~15 files/month), which local storage handles fine. Revisit if volume
 * grows enough for that to become a real risk; the backend already
 * accepts `storage_type: 'google_drive'` (a Drive file id as
 * `file_path`), this form just doesn't have the upload UI for it.
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
          <div key={doc.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm">
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
            ) : (
              <button type="button" onClick={() => handleDownload(doc)} className="text-brand-600 hover:underline">
                Download
              </button>
            )}
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
    </div>
  )
}
