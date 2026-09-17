import { AppShell } from '../components/AppShell'

/**
 * Placeholder home view for roles whose dedicated dashboard isn't built
 * yet (Sales Manager, Import Manager, Installation & Service Engineer,
 * Supplier, Customer — see docs/ROADMAP.md). Login and the API already
 * work for these roles; only the tailored view is pending.
 */
export function ComingSoonPage() {
  return (
    <AppShell title="Dashboard">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-lg font-medium text-slate-700">Your dashboard is on its way</p>
        <p className="max-w-sm text-sm text-slate-500">
          You're signed in and the system already knows what you're allowed to see — this role's tailored view just
          hasn't been built yet.
        </p>
      </div>
    </AppShell>
  )
}
