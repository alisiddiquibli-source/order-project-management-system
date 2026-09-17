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
  `AppShell` (header/nav), `OrderPortfolioTable` (the "every order I can
  see" table shared by Owner/Sales Manager/Import Manager — each role's
  dashboard just fetches its own already-scoped list and renders it
  through here), `CommentsPanel` and `ServiceTicketsPanel` (order detail
  page — channel-aware comments, and the full ticket lifecycle: raise,
  advance, confirm-closure).
- `src/pages/` — one file per route. Each of the seven roles gets its own
  home view (`OwnerDashboardPage`, `SalesManagerDashboardPage`,
  `CoordinatorDashboardPage`, `ImportManagerDashboardPage`,
  `EngineerDashboardPage`, `SupplierDashboardPage`,
  `CustomerDashboardPage`) rather than one generic screen reused
  everywhere; `ComingSoonPage` remains as the fallback for an
  unrecognized role.

## What's built vs. pending

Built: login, all seven role dashboards, order detail with live stage
status updates (the real write path, not a mockup — business-rule
rejections from the API are shown to the user verbatim), a comments
panel, and a service-tickets panel (raise/advance/confirm-closure).

Pending (see `../docs/ROADMAP.md`): evidence sub-forms (milestones,
FAT/SAT, engineer reports, training, acceptances) in the order detail
page; AMC contract/visit management screens (the Engineer's dashboard
surfaces due visits but can't yet create a contract or log one from the
UI); a proper Playwright e2e suite (each round's smoke test has been run
manually against a live backend during development, not committed — it
needs seed-data fixtures to be a real repeatable suite, not a
copy-pasted script).
