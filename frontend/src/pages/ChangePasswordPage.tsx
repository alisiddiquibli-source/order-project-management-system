import { useState } from 'react'
import { AppShell } from '../components/AppShell'
import { ApiError, api } from '../lib/api'

/**
 * Self password change — the other half of account administration
 * (docs/ARCHITECTURE.md §7.1): the Owner creates a login and hands the
 * new user a temporary password out of band, and this is where they set
 * their own from there. Available to every role, not just internal ones.
 */
export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function handleSubmit() {
    setFeedback(null)
    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', text: 'New password and confirmation do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setFeedback({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }

    setSubmitting(true)
    try {
      await api.patch('/me/password', { current_password: currentPassword, new_password: newPassword })
      setFeedback({ type: 'success', text: 'Password changed.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not change the password.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Change password">
      <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {feedback && (
          <p className={`mb-4 rounded-md px-3 py-2 text-sm ${feedback.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {feedback.text}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
          className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </AppShell>
  )
}
