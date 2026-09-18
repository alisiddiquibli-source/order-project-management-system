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
  `FatSatSection` (+ nested punch-list management), `ShipmentSection`
  (stage 6 — booking + "mark dispatched today"), `ImportTrackingSection`
  (stages 7/8, shared component parameterized by `stageId`),
  `EngineerReportSection`, `TrainingSection`, `AcceptanceSection`
  (auto-selects the one current eligible target record rather than
  asking the user to pick). `AmcSection` — order-level, not stage-scoped
  — Engineer-only AMC contract creation and visit scheduling/completion.
  `AiReportsPanel` (docs/ARCHITECTURE.md §10) — generate button + the
  acknowledge/dismiss/action lifecycle, reused at order scope (order
  detail page), project scope (Sales Manager's dashboard, one panel per
  project), and portfolio scope (Owner's dashboard); the parent owns
  fetching since each scope hits a different endpoint, this only renders
  the list and drives `PATCH /api/ai-reports/{id}`. `CommentsPanel` also
  gets a "Draft with AI" button (Sales Manager/PC only) that fills the
  message box from a follow-up draft — it never posts on its own, a human
  still clicks Post.
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
panel, a service-tickets panel (raise/advance/confirm-closure), the full
set of per-stage evidence sub-forms (now including shipment and
import-tracking screens for stages 6-8), the order-level AMC
contract/visit UI, and the AI advisory UI (risk advisory, project status
reports, portfolio advisory, follow-up drafting). A fresh order has been
walked through all 12 stages via the real UI end-to-end, across PC/Sales
Manager/Engineer/Customer logins — see `../docs/ROADMAP.md` for what that
caught. The AI UI was verified with a two-Sales-Manager fixture
confirming one SM never sees another's reports, and confirming a drafted
follow-up never auto-posts. The AMC/shipment/import-tracking screens were
verified in a separate round, live against a real server: booking and
dispatching a shipment, creating and progressing import tracking through
stages 7-8, and creating an AMC contract and completing a visit — all
through the UI.

Pending: a proper Playwright e2e suite (each round's verification has
been a manually-run script against a live backend, not committed — it
needs seed-data fixtures to become a real repeatable suite).
