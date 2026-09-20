import { useEffect, useState } from 'react'
import { fetchDocumentPreviewUrl } from '../lib/api'
import { mediaKind } from '../lib/media'
import type { DocumentRecord } from '../lib/types'

/**
 * Inline image/video preview for a locally-stored document, fetched
 * through the authenticated file endpoint (a plain <img src="/api/...">
 * can't attach the bearer token — see fetchDocumentPreviewUrl). Renders
 * nothing for Google Drive-backed documents or non-media types; the
 * caller keeps its own download/"View in Drive" link for those.
 */
export function DocumentPreview({ document, className }: { document: DocumentRecord; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const kind = document.storage_type === 'local' ? mediaKind(document.file_path) : 'other'

  useEffect(() => {
    if (kind === 'other') return undefined

    let objectUrl: string | null = null
    let cancelled = false
    fetchDocumentPreviewUrl(document.id)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        objectUrl = u
        setUrl(u)
      })
      .catch(() => {
        // A broken preview just shows nothing here — the row's own
        // Download button still surfaces the real error if the user tries it.
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id, kind])

  if (kind === 'other' || !url) return null

  if (kind === 'image') {
    return <img src={url} alt={document.type} className={className ?? 'max-h-48 rounded-md border border-slate-200 object-cover'} />
  }

  return <video src={url} controls className={className ?? 'max-h-64 w-full rounded-md border border-slate-200'} />
}
