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
  advance, confirm-closure). Evidence sub-forms — one per stage's
  evidence table, dispatched by `StageEvidence` per `stage_id` inside the
  order detail page's expanded stage row, deliberately mirroring the
  backend's `StageCompletionEvaluator`: `RequirementsSection`,
  `DocumentsSection` (also the download path — `downloadDocument()` in
  `api.ts`, since a plain `<a href>` can't attach the JWT), `MilestonesSection`,
  `FatSatSection` (+ nested punch-list management), `EngineerReportSection`,
  `TrainingSection`, `AcceptanceSection` (auto-selects the one current
  eligible target record rather than asking the user to pick).
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
panel, a service-tickets panel (raise/advance/confirm-closure), and the
full set of per-stage evidence sub-forms. A fresh order has been walked
through all 12 stages via the real UI end-to-end, across PC/Sales
Manager/Engineer/Customer logins — see `../docs/ROADMAP.md` for what
that caught.

Pending: AMC contract/visit management screens and shipment/import-
tracking screens for stages 6-8 (both API-complete, UI-absent — the
12-stage walk had to fast-forward those three stages with direct
database writes instead of through the UI); a proper Playwright e2e
suite (each round's verification has been a manually-run script against
a live backend, not committed — it needs seed-data fixtures to become a
real repeatable suite).
