# Frontend — Order & Project Lifecycle Management System

React + TypeScript + Vite + Tailwind CSS. See `../docs/ARCHITECTURE.md`
§11.1 for the UX principle this is built around, and `../CLAUDE.md` for
project-wide conventions.

## Development

```
npm install
npm run dev
```

The dev server proxies `/api` to the backend at `http://127.0.0.1:8130`
(see `vite.config.ts`) — run the PHP backend (`../backend`) on that port
locally, or adjust the proxy target.

## Structure

- `src/lib/` — `api.ts` (fetch wrapper: attaches the JWT, retries once on
  401 via refresh), `auth.tsx` (React context for the logged-in user),
  `types.ts` (shapes matching the backend's JSON responses).
- `src/components/` — shared UI: `StatusBadge` (the one place stage/order
  status renders, so it's consistent everywhere), `ProgressBar`,
  `AppShell` (header/nav).
- `src/pages/` — one file per route. Each role gets its own home view
  (`OwnerDashboardPage`, `CoordinatorDashboardPage`, `ComingSoonPage` for
  roles not yet built) rather than one generic screen reused everywhere.

## What's built vs. pending

Built: login, Company Owner's portfolio view, Project Coordinator's
order list + order detail with live stage status updates (the real
write path, not a mockup — business-rule rejections from the API are
shown to the user verbatim).

Pending (see `../docs/ROADMAP.md`): Sales Manager, Import Manager,
Installation & Service Engineer, Supplier, and Customer views (they land
on `ComingSoonPage` today — their login and API access already work);
evidence sub-forms (milestones, FAT/SAT, engineer reports, training,
acceptances) in the order detail page; a proper Playwright e2e suite
(a one-off smoke test was run manually against a live backend during
development, not committed — it needs seed-data fixtures to be a real
repeatable suite, not a copy-pasted script).
