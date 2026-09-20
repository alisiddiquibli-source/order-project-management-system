# Build Roadmap

Phased so each phase is reviewable and usable on its own before the next
begins.

- [x] **Phase 1 — Core internal system (backend)**
  Done: auth for internal roles (+ the `@businesslinks-pk.com` domain
  constraint); projects + orders (one machine each, with on_hold/cancelled
  lifecycle); requirements; the 12-stage pipeline with manually-set target
  dates (original + current + `commitment_changes` with the approval
  rule); stage dependency/exception rules (severity-aware, never
  overriding a fail, `stage_exceptions` creation endpoint); manufacturing
  milestones (non-empty requirement); `engineer_reports`/`fat_sat_records`
  (+ punch lists)/`training_records` evidence endpoints; document upload
  (real local file storage + Google Drive file-id path for FAT/SAT
  photo/video, §4.3.1); the `acceptances` model (customer-acceptance
  requirement for SAT/Training/Handover, tested against a real retest-
  supersede case); blocked-stage logging; channel-scoped comments with
  per-supplier project-level sharing; the daily deadline/blocker cron
  (`cron/check_stage_deadlines.php`, idempotent, tested against a live
  overdue/at-risk/stale-blocker scenario).
  Not done: Sales Manager and Company Owner dashboard/summary endpoints —
  the underlying data and authorization are all in place, what's missing
  is the aggregation views themselves, which will land as part of the
  frontend work (tracked separately, not one of these numbered phases).
- [x] **Phase 2 — External logins**
  One customer login per project (`scope_project_id`) and one supplier
  login per supplier company (`supplier_id`) — comment-only, channel-
  scoped, customer acceptance authority wired in. Built and tested
  together with Phase 1 rather than as a separate pass — the scope model
  needed both kinds of login exercised together to trust it.
- [x] **Phase 3a — Shipment & customs detail (API)**
  Shipment tracking with `actual_dispatch_date` gating stage 6 completion,
  per-stage `customer_import_tracking` (+ append-only update history) for
  stages 7–8. Tested end-to-end: a booking alone couldn't complete stage
  6, dispatch + the stage 5 prerequisite together could; stage 7's
  history preserved both a `documents_submitted` and a later `cleared`
  entry rather than overwriting; a second import-tracking record on an
  already-tracked stage was correctly rejected; Sales Manager correctly
  blocked from creating a shipment (PC-only).
- [x] **Phase 3b — Notifications**
  SMTP email delivery (PHPMailer) alongside every `notifications` row —
  best-effort, never blocks the write that triggered it (a mail-server
  failure is logged, not thrown). `Bli\Models\NotificationRepository`
  centralizes both halves: the daily deadline/blocker cron's existing
  same-day dedup, and a new per-comment notification with no dedup (one
  real event, one notification). Comment notifications resolve recipients
  by channel — internal reaches the order's PC/Sales Manager/every Owner;
  customer and supplier channels reach that same internal set plus the
  relevant external login(s) (the project's customer account, or the
  named supplier company's account), and the author never gets their own
  comment back. Verified against a live server: a real SMTP debug server
  received the actual emails (not just the DB rows) for an internal, a
  customer, and a supplier comment, each with the correct recipient set
  and no cross-channel leakage; the deadline cron's idempotency held
  across a second run through the shared repository.
- [x] **Phase 4 — Post-handover service module**
  `AmcContractRepository`/`ServiceTicketRepository` (+ `src/routes/service.php`):
  AMC contracts/visits managed directly by the Installation & Service
  Engineer (no PC hand-off), with a Company-Owner-only portfolio-wide
  due-visits view. Service tickets: customer or Engineer opens one
  (auto-assigned to the order's own engineer); the Engineer can only walk
  it forward open -> in_progress -> resolved (resolution requires
  `resolution_notes`, `in_progress` stamps `first_response_at`); closing
  always requires either the customer's own confirmation
  (`POST .../confirm-closure`) or the SLA cron's auto-close — an Engineer
  can never close one directly, verified against a live server (a direct
  close attempt was rejected with a 422, not silently allowed).
  `Bli\Domain\BusinessHours` computes SLA elapsed time in actual business
  hours/days (configurable window), not calendar time, and
  `Bli\Domain\TicketSlaScanner` (the new **hourly** `check_ticket_sla.php`
  cron) uses it for response/resolution breach notifications and the
  5-business-day resolved-with-no-response auto-close
  (`closure_type='auto_closed_no_response'`, never presented as if the
  customer agreed) — same-day dedup confirmed idempotent across a second
  run, same pattern as the daily deadline cron.
  `orders.warranty_start_date` now auto-stamps the moment the order's own
  chosen trigger stage (`warranty_start_trigger` -> stage 6/9/10/12)
  completes (`OrderRepository::maybeStartWarranty()`, hooked into
  `OrderStageRepository::updateStatus()`); `warranty_end_date` is left for
  the PC/Sales Manager to set from the actual contract term — there's no
  fixed system-wide warranty length to derive it from.
  **Assumption flagged for BLI to confirm**: the response/resolution SLA
  hour targets by severity (critical/high/medium/low) are a reasonable
  default matrix I set in code (`ServiceTicketRepository::DEFAULT_SLA_HOURS`),
  not a figure given in the design doc — a caller can override per ticket,
  but the defaults themselves should be sanity-checked against what BLI
  actually commits to customers before go-live.
- [x] **Phase 5 — AI integration layer**
  `Bli\Ai\AiAdvisorService` orchestrates all four use cases (order risk
  advisory, project status reports, portfolio advisory, follow-up
  drafting) through one path: gather scoped facts -> render a prompt ->
  call the configured provider adapter (`ClaudeAdapter`/`GeminiAdapter`/
  `ChatGptAdapter`, picked by `AI_DEFAULT_PROVIDER`) -> persist to
  `ai_reports`. **The scope filter lives in `Bli\Domain\AiDataGatherer`,
  not the route or the caller** — every method re-authorizes from the
  requester's own claims exactly like any other read, and portfolio
  advisory is gated Owner-only inside the gatherer itself, independent of
  the route's own role check. Portfolio advisory attributes risk by
  `blockers.responsible_party` per project (never a raw count, never "who
  typed the entry") — verified live: a blocker seeded with
  `responsible_party='customer'` came back attributed to "customer" in
  the generated advisory, not blamed on the project's PC.
  **Schema gap found and fixed before building on it**: `ai_reports` had
  no way to scope a project-level status report to that project's own
  Sales Manager/PC — only `order_id` (one order) and "both NULL"
  (portfolio, Owner-only) existed, even though §10 explicitly names
  "Sales Manager's per-project dashboard" as its own use case. Added a
  nullable `project_id` column with its own FK/index rather than
  overloading `order_id` or collapsing it into the portfolio bucket.
  The acknowledge/dismiss/action lifecycle is on `AiReportRepository::updateStatus()`;
  `GET /api/ai-reports` and `PATCH /api/ai-reports/{id}` are scoped by
  report kind (order-scope, project-scope, or Owner-only for portfolio),
  run as three separate queries rather than one merged query — order and
  project scope use different table aliases in `Bli\Auth\Scope`, and
  forcing them into one query meant alias collisions or fragile string
  surgery to avoid them.
  The daily digest (`cron/check_ai_digest.php` + `AiDigestScanner`): one
  status report per active project (notifying that project's SM/PC) plus
  one portfolio advisory (notifying every Owner) — a provider failure on
  one project doesn't stop the rest, same pattern as `DeadlineScanner`/
  `TicketSlaScanner`. **Cost note for BLI**: this cron makes one AI
  provider call per active project plus one portfolio call, every day —
  a real recurring cost to confirm is acceptable before enabling it in
  production.
  Verified end-to-end against a live server with a local mock of
  Anthropic's Messages API (same technique as the SMTP debug server in
  Phase 3b) standing in for the real provider, since no production API
  key exists yet: all four on-demand use cases, the digest cron, the
  acknowledge lifecycle, a missing-API-key failure returning 502 with no
  garbage row written to `ai_reports`, and — the two-Sales-Manager
  fixture this round specifically added — that Sales Manager A can never
  see, generate against, or acknowledge Sales Manager B's project/order
  reports, and vice versa.
  **Frontend added in the same pass**: `AiReportsPanel` (generate button +
  the acknowledge/dismiss/action lifecycle, reused at all three scopes) on
  the order detail page (risk advisory), the Sales Manager's dashboard
  (one panel per project they manage, status reports), and the Owner's
  dashboard (portfolio advisory); a "Draft with AI" button in
  `CommentsPanel` for Sales Manager/PC that fills the message box from a
  follow-up draft — **it only ever fills the box, never posts** — a human
  still has to click Post themselves. Verified live, including the one
  check that mattered most here: clicking "Draft with AI" did not create
  a comment (confirmed by checking the thread before the explicit Post
  click), and the two-SM fixture's isolation held in the UI too — SM2's
  dashboard never renders SM1's project number anywhere on the page.
- [~] **Frontend** (not one of the numbered backend phases — tracked
  alongside them)
  React + TypeScript + Vite + Tailwind. Built: login, JWT handling with
  silent refresh, all seven role dashboards (Company Owner and Project
  Coordinator from before; Sales Manager, Import Manager, Installation &
  Service Engineer, Supplier, and Customer added this round), order
  detail page with live stage status updates (a real write path — API
  business-rule rejections are shown to the user verbatim, not
  swallowed), plus a comments panel and a service-tickets panel on the
  order detail page (list, raise, advance open -> in_progress -> resolved,
  customer confirm-closure — the Phase 3b/4 UI). Sales Manager/Import
  Manager share one `OrderPortfolioTable` component with the Owner rather
  than three near-identical copies; the Engineer's dashboard aggregates
  open tickets and due AMC visits client-side (no dedicated "my visits"
  endpoint exists yet, only the Owner's portfolio-wide one).
  Verified with a real Chromium browser against a live backend + database
  for all seven roles, screenshotted, not just type-checked — including a
  full ticket lifecycle driven through the actual UI (customer raises one,
  engineer works it to resolved, customer confirms closure) and a posted
  comment round-trip.
  **Real bug caught by this pass, fixed before it reached the UI**: the
  backend's order/project read paths returned every column to every
  authorized role, including `contract_value`/`currency` on orders and
  `customer_name`/`customer_contact` on projects to a **supplier** login —
  a violation of docs/ARCHITECTURE.md §6 ("supplier visibility is enforced
  by field, not just by 'not commercial terms'"). Fixed with a
  `redactForRole()` step in `OrderRepository`/`ProjectRepository`, the one
  place every such read passes through; confirmed via direct API calls
  that a supplier's response now omits those fields while a PC's response
  still includes them.
  **Evidence sub-forms are now built**, one component per stage's evidence
  table (`RequirementsSection`, `DocumentsSection`, `MilestonesSection`,
  `FatSatSection` with nested punch-list management, `EngineerReportSection`,
  `TrainingSection`, `AcceptanceSection`), dispatched per stage_id by
  `StageEvidence` inside the order detail page's expanded stage row —
  deliberately mirroring `StageCompletionEvaluator`'s own per-stage
  evidence checks, so what the UI shows to fill in is exactly what the
  server gates completion on. `AcceptanceSection` auto-selects the current
  eligible target record (the live FAT/SAT attempt, the latest training
  record, the latest handover-readiness report) rather than asking the
  user to pick one — there's only ever one live candidate at a time.
  Needed (and added) six GET list routes that only existed as
  `listForStage()`/`listForOrder()` repository methods with no route
  exposing them (`requirements`, `milestones`, `fat-sat`, `punch-items`,
  `engineer-reports`, `training`, `acceptances`) — the sub-forms can't
  show existing evidence without them.
  Verified end-to-end against a live server: a fresh order walked through
  **all 12 stages** via the real UI, across five logins (PC, Sales
  Manager, Engineer, Customer, plus direct evidence writes for stages 6-8
  only, since no shipment/import-tracking UI exists yet) — requirement
  approval, PO upload, a milestone checklist, a punch-list item raised and
  resolved, a FAT pass, an installation report, a SAT pass with genuine
  customer acceptance, a training record with genuine customer acceptance,
  and a handover certificate with genuine customer acceptance, ending with
  the order showing all 12 stages `Completed`.
  **Real bug caught by that walk, fixed before it shipped**: a stage-4
  completion that supplied its confirming note in the *same* PATCH request
  that also set `status=completed` was rejected — `StageCompletionEvaluator`
  checked the database's notes column before that request's own notes
  update had been applied, so a perfectly valid combined request always
  failed. Fixed in `OrderStageRepository::updateStatus()` by wrapping the
  notes write and the evidence check in one transaction (notes now apply
  *before* the check runs), with a rollback — confirmed directly — if
  completion is then still refused, so a failed request has no side
  effects. Two UI-only issues surfaced by the same walk and fixed before
  they shipped: the FAT/SAT punch-list "add" button and description field
  shared exact text with the always-visible "raise a ticket" form, and the
  FAT/SAT record-result button was labeled "Save" — identical to the
  stage-status form's own "Save" button rendered right next to it.
  **AI advisory UI is now built too** (see the Phase 5 entry above):
  `AiReportsPanel`, reused at order/project/portfolio scope, plus a
  "Draft with AI" button in `CommentsPanel` that only ever fills the
  message box — verified live that it never posts on its own.
  **AMC and shipment/import-tracking screens are now built too**:
  `ShipmentSection` (stage 6 — carrier/mode/ETD/ETA booking, PC-only, plus
  a "mark dispatched today" action that sets `actual_dispatch_date`, the
  field stage 6 completion actually gates on), `ImportTrackingSection`
  (stages 7 and 8 — shared component parameterized by `stageId`, since
  both stages read the same per-`order_stage` `customer_import_tracking`
  record; shows the append-only status history and flags which
  `latest_status` value each stage completes on — `cleared` for 7,
  `delivered` for 8), and `AmcSection` (order-level, not stage-scoped —
  contract creation and visit scheduling/completion, Engineer-only,
  mirroring the AMC/service module's existing due-visits view). Stage 8
  now shows both `ImportTrackingSection` and the existing delivery-
  documents `DocumentsSection`, since the backend treats both as
  legitimate stage-8 evidence. Verified end-to-end against a live server
  (fresh MariaDB test DB, seeded fixtures, PHP built-in server + Vite dev
  server, a Playwright script): booked and dispatched a shipment, created
  and progressed import tracking through stage 7 into stage 8, and
  created an AMC contract, scheduled a visit, and marked it visited — all
  through the real UI, not direct API calls.
  A committed Playwright e2e suite (`frontend/e2e/`) now exists —
  see the entry below.
- [x] **Phase 6 — Bluehost deployment**
  Live at `m.businesslinks-pk.com`. Backend code lives outside the public
  document root (`~/bli-app/backend`, cloned from this repo), with a thin
  front controller at `m.businesslinks-pk.com/api/index.php` pointing at
  it by absolute path — the same layout `public/index.php` uses locally,
  just with `dirname(__DIR__)` replaced by a hardcoded path since the
  file no longer lives next to `vendor/`. Frontend is a static build
  (`frontend/dist`) served directly from the document root, with an
  `.htaccess` SPA fallback so client-side routes survive a refresh.
  MySQL database + schema imported via phpMyAdmin. AutoSSL issued for the
  subdomain. All three cron jobs (`check_ticket_sla.php` hourly,
  `check_stage_deadlines.php` and `check_ai_digest.php` daily) are live
  in cPanel's Cron Jobs. `AI_DEFAULT_PROVIDER=gemini` with a Google AI
  Studio free-tier key, since Claude/ChatGPT's APIs don't have a
  no-cost tier for this kind of light, infrequent use.
  Verified live: `GET /api/health` returns `200
  {"status":"ok","db":"connected"}` over HTTPS; the site loads and a
  Company Owner can log in; all three cron scripts run cleanly by hand
  (`check_ai_digest.php` logged one internal failure on an empty
  database with zero orders/projects — not yet root-caused, re-test once
  real data exists).
  **Known gap, not yet addressed**: `schema.sql`'s `CHECK` constraint
  requiring internal-role emails to end in `@businesslinks-pk.com`
  (documented in `CLAUDE.md` as a defense-in-depth backstop, "enforced
  here... not just in the account-creation API") is not actually being
  enforced by the live server's MySQL/MariaDB version — a
  `company_owner` row with a non-`@businesslinks-pk.com` email inserted
  without error. Likely a MySQL version older than 8.0.16 (or an
  equivalent MariaDB build) parsing `CHECK` but not enforcing it. The
  app-layer validation still applies, but this particular backstop is
  currently a no-op in production — worth confirming the server's exact
  version and, if it can't enforce `CHECK`, deciding whether to move
  that validation into a `BEFORE INSERT` trigger instead.
- [x] **Committed Playwright e2e suite** (`frontend/e2e/`)
  Every prior verification pass in this project (the 12-stage walk, the
  AMC/shipment/import-tracking round, the AI advisory UI) was a
  one-off, manually-run script — this is the first one that's actually
  checked in and repeatable via `npm run test:e2e` from a clean
  checkout. `global-setup.ts` provisions a throwaway MySQL database from
  `backend/database/schema.sql` plus a deterministic fixture
  (`e2e/fixtures/seed.sql` — one user per internal role, one order with
  stages 6-8 `in_progress`), writes a scoped `backend/.env` (backing up
  and restoring whatever real `.env` was already there, so the suite
  never clobbers a developer's local config), and boots the PHP + Vite
  dev servers; `global-teardown.ts` tears both down. Three spec files:
  `auth.spec.ts`, `stage-evidence.spec.ts` (stage 6 shipment booking +
  dispatch, stages 7-8 import tracking through `cleared` into
  `delivered`), and `amc.spec.ts` (contract creation, visit
  scheduling/completion) — covering exactly the frontend work from the
  two rounds above that had zero regression coverage before this.
  **Real bug caught immediately**: `api.ts`'s fetch wrapper treated
  *any* 401 — including one from the login request itself — as "your
  session expired," triggering a doomed silent-refresh attempt, a hard
  redirect to `/login`, and a misleading "Session expired" message
  instead of the backend's actual "Invalid email or password." Every
  real user who ever mistyped a password would have hit this. Fixed by
  only taking that path when a token was actually attached to the
  request (an unauthenticated request, like login, can't have a session
  to expire) — verified both by the now-passing test and by re-reading
  the fix against the refresh-token flow for an already-logged-in user,
  which is unaffected.

## Explicitly out of scope for now

- **Payment/value tracking** — `contract_value`/`currency` stay as static
  reference fields; no invoicing, payment milestones, or balances.

## Current status

Phase 0 (system design) — complete. Went through BLI's team structure,
two rounds of external design review (15 points, then a further two
independent reviews converging on acceptance/evidence rigor), and three
scope clarifications from BLI (order = one machine; Engineer submits
stage 9–12 evidence with PC recording completion; Sales Manager is
project-level custodian). See `docs/ARCHITECTURE.md` (v4) for the current
design — the sharpest fix in this round was requiring genuine customer
acceptance (not a Sales Manager alone) to complete SAT and Handover.

Phases 1–2 (backend) — complete and verified end-to-end against a real
MySQL database and running server, not just read back: a full order
walked through all 12 stages via real API calls (not direct DB
inserts) with every completion gate actually enforced, a FAT retest
correctly voided the superseded record's acceptance, a multi-supplier
project correctly isolated one supplier's comments from another's, and
the deadline cron correctly flagged at-risk/overdue/stale-blocker cases
and stayed idempotent across repeated runs. Three real bugs were found
and fixed in the process (see `CLAUDE.md`'s "Known PHP/PDO gotcha" and
stage-lookup notes) — caught precisely because testing went beyond the
first happy path.

Frontend — all seven role dashboards exist, plus a comments panel, a
service-tickets panel, the full set of per-stage evidence sub-forms
(including AMC, shipment, and import-tracking screens for stages 6-8, the
last ones that were UI-absent) on the order detail page, and the AI
advisory UI. A fresh order was walked through all 12 stages via the real
UI end-to-end (see Phase 4/frontend notes above), catching a genuine
backend bug (a notes+completion race in the same request) and two UI text
collisions along the way. Next frontend work: a committed e2e suite (the
one remaining gap — every verification pass so far has been a
manually-run script).

Phase 3a (shipment/customs API) — complete; every core-pipeline stage
(1–12) is now reachable through a real, tested API endpoint, none left
requiring a direct DB write to exercise.

Phase 3b (notifications) — complete; email now rides alongside every
notification the system already generates, verified against a real SMTP
server, not just a mocked send.

While in the area: bumped `firebase/php-jwt` from ^6.10 to ^7.1
(`composer audit` had flagged CVE-2025-45769 — low severity, and not in a
code path this app uses, but a one-line version bump with no API change,
so fixed rather than left noted).

Phase 4 (post-handover service) — complete; verified end-to-end against a
live server: AMC contract/visit creation, the Owner-only portfolio due-
visits view, the full service-ticket lifecycle including a rejected
direct-close attempt and a rejected resolve-with-no-notes attempt, an SLA
response-breach notification (real email delivered, business-hours math
correct), a 5-business-day auto-close, and the warranty-start-date hook —
all against real data, not direct DB assertions alone. One bug caught by
testing: the new `/api/amc-visits/due` route initially called
`requireRole()` without `requireAuth()` first, which made every request
(including the Company Owner's own) 403 — fixed and re-verified.

Phase 5 (AI layer) — complete; verified end-to-end against a live server
using a local mock of the Anthropic Messages API standing in for the real
provider (no production API key exists yet). See the Phase 5 entry above
for what that covered, including a schema gap found and fixed
(`ai_reports` needed its own `project_id` column) and a two-Sales-Manager
scoping test that confirmed one SM can't see or act on another's reports.

The AI advisory UI (`AiReportsPanel` at order/project/portfolio scope,
plus "Draft with AI" in `CommentsPanel`) was added right after Phase 5's
backend, verified live including that a drafted follow-up never posts
itself — a human still has to click Post.

AMC contract/visit creation screens and shipment/import-tracking screens
for stages 6-8 were added right after (`AmcSection`, `ShipmentSection`,
`ImportTrackingSection`), verified live against a real server as
described above — the frontend now has a dedicated evidence UI for all
12 stages plus the order-level AMC module.

Phase 6 (Bluehost deployment) — complete; the system is live at
`m.businesslinks-pk.com`, see the Phase 6 entry above for the layout,
what was verified, and the one known gap (the internal-email `CHECK`
constraint isn't enforced by the live server's MySQL/MariaDB version).

A committed Playwright e2e suite (`frontend/e2e/`) was added right
after — see the entry above, including a real login bug it caught and
fixed on its first run (every failed login attempt was showing
"Session expired" instead of the actual "Invalid email or password").
That fix is in the frontend source but has not yet been rebuilt and
redeployed to the live Bluehost site, which is still running the build
from before this fix.

Not yet started: nothing on the current roadmap — the tracked backlog
(Phases 0-6 plus the e2e suite) is now complete. Open follow-ups are
the two items noted in the Phase 6 entry (the `check_ai_digest.php`
cold-start failure, and the unenforced `CHECK` constraint) and
redeploying the frontend with the login-error-handling fix above.
