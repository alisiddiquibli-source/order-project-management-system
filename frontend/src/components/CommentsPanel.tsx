import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Comment, CommentChannel } from '../lib/types'

const CHANNEL_LABELS: Record<CommentChannel, string> = {
  internal: 'Internal',
  customer: 'Customer',
  supplier: 'Supplier',
}

/**
 * Order-level comment thread (docs/ARCHITECTURE.md §6). A customer or
 * supplier login only ever sees (and can only ever post to) their own
 * channel — the server decides that, this just doesn't offer a channel
 * picker to those roles since it would be ignored anyway
 * (CommentRepository::resolveChannelForWrite).
 */
export function CommentsPanel({ orderId }: { orderId: number }) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState<CommentChannel>('internal')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canPickChannel = user
    ? !['customer', 'supplier'].includes(user.role)
    : false

  async function reload() {
    setComments(await api.get<Comment[]>(`/orders/${orderId}/comments`))
  }

  useEffect(() => {
    reload().catch(() => setError('Could not load comments.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function handlePost() {
    if (message.trim() === '') return
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/orders/${orderId}/comments`, {
        message,
        ...(canPickChannel ? { channel } : {}),
      })
      setMessage('')
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post your comment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Comments</h2>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-4 space-y-3">
        {comments?.map((comment) => (
          <div key={comment.id} className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{comment.user_name}</span>
              {canPickChannel && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                  {CHANNEL_LABELS[comment.channel]}
                </span>
              )}
              <span>{new Date(comment.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-sm text-slate-800">{comment.message}</p>
          </div>
        ))}
        {comments?.length === 0 && <p className="text-sm text-slate-400">No comments yet.</p>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {canPickChannel && (
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as CommentChannel)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="internal">Internal</option>
            <option value="customer">Customer</option>
            <option value="supplier">Supplier</option>
          </select>
        )}
        <input
          type="text"
          placeholder="Write a comment…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePost()}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handlePost}
          disabled={submitting || message.trim() === ''}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Post
        </button>
      </div>
    </div>
  )
}
