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
  **Gap found and fixed**: `schema.sql`'s `CHECK` constraint requiring
  internal-role emails to end in `@businesslinks-pk.com` (documented in
  `CLAUDE.md` as a defense-in-depth backstop, "enforced here... not
  just in the account-creation API") turned out not to be enforced by
  the live server's MySQL/MariaDB version — a `company_owner` row with
  a non-`@businesslinks-pk.com` email inserted without error, almost
  certainly a MySQL version older than 8.0.16 (or an equivalent MariaDB
  build) parsing `CHECK` but never enforcing it. `CHECK` constraints
  aren't a reliable backstop across MySQL versions in general, so fixed
  with `BEFORE INSERT`/`BEFORE UPDATE` triggers on `users`
  (`trg_users_email_domain_insert`/`_update`) instead — those raise a
  real error (`SIGNAL SQLSTATE '45000'`) on every MySQL/MariaDB version,
  regardless of `CHECK` support. The `CHECK` constraint itself stays in
  the schema too, both as documentation and for any server that does
  honor it. Verified locally: a bad insert and a bad update are both
  rejected, valid internal-role and supplier/customer inserts still
  succeed, and the full e2e suite still passes against the updated
  schema. **Still needs applying to the live Bluehost database** — the
  trigger is only in `schema.sql` in the repo so far; re-importing it
  against the running production database (or running the `CREATE
  TRIGGER` statements directly) is a live-schema change worth doing
  deliberately, not something to push unattended.
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
- [x] **Account administration** (docs/ARCHITECTURE.md §7.1)
  Specified from Phase 0 but never built in any of Phases 1-6 — the
  only way to add a real user was a hand-written SQL insert, and there
  was no password-reset path at all. Adds `src/routes/users.php`
  (`GET`/`POST /api/users`, `PATCH /api/users/{id}`,
  `POST /api/users/{id}/reset-password` — Company Owner only) and
  `PATCH /api/me/password` (any authenticated user, to set their own
  password after a temporary one). A created account's or a reset's
  password is generated randomly and returned exactly once in that
  response — never stored in plaintext, never logged, never
  retrievable again — so the Owner has to actually hand it to the
  person before navigating away. Validates the same
  `@businesslinks-pk.com` domain rule the database triggers enforce, so
  a bad request gets a clean 422 rather than relying solely on the
  trigger; an Owner cannot deactivate their own account. Frontend:
  `UserManagementPage` (`/users`, Owner-only) and `ChangePasswordPage`
  (`/change-password`, every role).
  **While in the area**, also widened project creation from
  Project-Coordinator-only to Sales Manager/PC/Owner, and added project
  deletion (`DELETE /api/projects/{id}`, Owner-only) — `ProjectsPage`
  is the new frontend surface for both. Deletion is blocked, not
  cascaded, if the project has any order, document, comment, or scoped
  customer login attached, consistent with how this system treats that
  data as an audit trail rather than something to silently discard.
  Verified end-to-end against a live server for every scenario (create/
  reset/deactivate/reactivate a login, domain validation, the
  self-lockout guard, self password change with a real re-login,
  project creation by each allowed role, deletion blocked for
  non-owners and blocked when an order exists) before adding the same
  coverage to the committed e2e suite (`admin.spec.ts`).

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
`m.businesslinks-pk.com`, see the Phase 6 entry above for the layout
and what was verified.

A committed Playwright e2e suite (`frontend/e2e/`) was added right
after — see the entry above, including a real login bug it caught and
fixed on its first run (every failed login attempt was showing
"Session expired" instead of the actual "Invalid email or password").
That fix was rebuilt and redeployed to the live site and verified
live: a deliberately wrong password now shows the correct inline
error with no page reload.

The `check_ai_digest.php` cold-start failure was root-caused, not just
an empty-database quirk: Google retired the `gemini-2.0-flash` model
the adapter defaulted to. Fixed in code (adapter fallback and
`.env.example` both updated) and on the live server (`GEMINI_MODEL=
gemini-3.6-flash` added to `.env`) — verified live, the portfolio
advisory now returns a real result instead of a 404.

The internal-email `CHECK` constraint gap was also root-caused and
fixed in code (see the Phase 6 entry above for the trigger-based fix
and its local verification) and applied to the live database —
verified there too: a deliberately bad insert is rejected, and the
existing Company Owner login was updated to a real
`@businesslinks-pk.com` address to match.

Account administration (create/deactivate logins, reset passwords,
role assignment) and project creation/deletion were added right after
— see the entry above. Both were designed from Phase 0
(docs/ARCHITECTURE.md §7.1) but had never actually been built; this
closes that gap.

Email notifications are now live in production — `m@businesslinks-pk.com`
via Bluehost's own mail hosting (SSL, port 465), no separate signup or
cost since it's included with the hosting plan already in use.
Verified with a real end-to-end test send (`Mailer::send()` invoked
directly against the live SMTP config), not just a saved config.

**Google Drive for FAT/SAT media — deliberately not built.** Real
upload volume is ~15 files/month, well within what local storage
already handles; the disk-quota risk that motivated the original
Drive design (docs/ARCHITECTURE.md §11) isn't a real concern at this
volume. `DocumentsSection` still only covers local uploads — see its
own doc comment for what to revisit if volume grows.
Scoping this surfaced a real, unrelated bug: stages 5 (FAT) and 10
(SAT) never rendered a `DocumentsSection` at all, so there was no way
to attach a FAT/SAT report or photo through the UI, not even locally.
Fixed, along with a second bug it exposed — `FatSatSection`'s report-
document picker is a sibling component with its own independent
fetch, so a freshly-uploaded report didn't show up in the dropdown
without a page reload. Both verified live and covered by a new
regression test (`e2e/fatsat-documents.spec.ts`, suite now 11/11).

Not yet started: nothing on the current tracked roadmap. Real gaps
that remain before day-to-day use, not yet scheduled as roadmap items:
no staff/supplier/customer accounts exist yet beyond the Company
Owner (account administration now makes this possible, just not yet
done); and `check_ai_digest.php` has only been verified against an
empty database, not real orders/projects.

**Project media (photo/video) — extended the existing document system
rather than a separate blog/CMS.** The Owner asked for a way to host
video and other documents for a project that integrates with the
existing system. Recommended against a second, separate CMS
(e.g. a private WordPress blog) on the same Bluehost account: that
account's `public_html` had a confirmed, unremediated web-shell
compromise (see the housekeeping-system deployment notes) — standing
up a new CMS there before that's cleaned up would be a real risk, and
a second system is a second thing to secure/patch/bridge auth to for
no real benefit at this scale.

Instead: `DocumentRepository`'s upload allowlist now accepts video
(`mp4`, `mov`, `webm`, `m4v`) alongside the existing document types,
keyed to a proper MIME-type map used both for validating uploads and
for serving the right `Content-Type`/disposition back (previously
every file was served as `application/octet-stream` with a forced
download — now images/video serve `inline` with their real type, and
non-media files still download as before). A new `DocumentPreview`
component renders an inline `<img>`/`<video>` for local image/video
documents (fetched through the existing authenticated-blob pattern,
same as downloads always have — no query-string tokens, no public
URLs) and is now used both in `DocumentsSection` (per-stage documents)
and a new project-wide view.

New: `GET/POST /api/projects/{id}/documents` — a project-level media
feed aggregating every document across all of a project's orders plus
general project uploads not tied to any one order/stage (e.g. a
walkthrough video, site-survey photos), same visibility rules as the
order-scoped endpoint. New `ProjectMediaPage` (`/projects/:id/media`,
linked from the Projects list) shows this as a grid with inline
previews. Verified live: uploading a photo and a video both preview
inline, download still works, and the feed correctly includes a
document uploaded through the order-level FAT flow — covered by a new
regression test (`e2e/project-media.spec.ts`, suite now 12/12).

Operational note, not yet acted on: this only helps once the live
Bluehost PHP's `upload_max_filesize`/`post_max_size` are large enough
for real video files — worth checking/raising via cPanel's MultiPHP
INI Editor (e.g. to ~200M) before relying on this for anything but
small clips.

**Order creation didn't actually exist anywhere in the UI — the
Owner's live testing caught this.** Asked to simulate real usage with
freshly-created accounts (as an actual new deployment would start:
Owner creates staff, staff create the project and its machines), which
surfaced that `POST /api/orders` had been fully built on the backend
since Phase 1 but never had a form calling it: a Project could be
created, but there was no way, anywhere in the app, to add an Order
(machine) to it. The same simulation also found that Project
creation's Sales Manager/PC fields were raw numeric user-ID inputs
with no lookup — workable only because `GET /api/users` was Owner-only,
so even the Owner's own hint text ("look up IDs on Manage users") was
invisible to the Sales Manager/PC roles who can also create projects.
And there was no way to create a Supplier company at all, which orders
require a valid `supplier_id` for — so even fixing the ID lookup
wouldn't have been enough; a brand-new deployment had zero suppliers
to reference.

Fixed, all verified live end to end:
- New `SupplierRepository`/`routes/suppliers.php`
  (`GET`/`POST /api/suppliers`) — suppliers are a simple company
  directory, visible to any authenticated internal role, created by
  the same roles allowed to create projects/orders.
- `GET /api/users` widened from Owner-only to also allow Sales
  Manager/PC, but only for a role-scoped lookup (`?role=`) — never the
  full cross-role admin listing those two still can't see. Mutating
  endpoints (create/patch/reset-password) stay Owner-only, unchanged.
- `ProjectsPage`'s Sales Manager/PC fields are now dropdowns of actual
  active users by name/email, not raw IDs — with a plain warning if
  the needed role has zero accounts yet, instead of a confusing empty
  picker.
- `UserManagementPage`'s create-login form now shows a Supplier
  picker (with inline "add a new supplier") when role=Supplier, and a
  Project picker when role=Customer — previously neither
  `supplier_id` nor `scope_project_id` could be set through the UI at
  all, so a supplier/customer login created there could never see
  anything (both fields drive all visibility filtering for those
  roles). Backend now rejects creating either role without the
  matching reference, rather than silently leaving it NULL.
- New `ProjectDetailPage` (`/projects/:id`, linked as "Orders" from
  the Projects list) — the actual missing order-creation form: order
  number/machine name/spec, Supplier picker with inline add,
  Installation Engineer picker, dates. PC-only, matching the backend's
  existing role gate.

Verified with a from-scratch simulation matching how BLI will actually
onboard: Owner creates a Sales Manager + PC + Engineer login with no
pre-existing accounts, logs out, the new PC logs in with their
temporary password, creates a project (Owner does that part), adds a
brand-new supplier inline, and creates an order — followed all the way
through to the order's own stage-pipeline page loading correctly.
Covered by two new regression tests (`e2e/full-simulation.spec.ts`,
`e2e/user-role-scoping.spec.ts`); full suite now 15/15.

**Owner couldn't create or fix an order at all — flagged live, asked
rather than silently decided.** `ProjectDetailPage`'s "Add a machine"
form is PC-only, matching `POST /api/orders`'s original role gate —
by design (§2: Owner has "full visibility... no project data entry").
Live testing showed this is a real gap in practice: if no PC is
available, the Owner can't create or correct an order, and separately
there was no way for *anyone* to edit an order's details after
creation at all (not even the PC who made it) — a typo in machine
name meant a direct database fix. Since the first point is an
access-control decision, not a bug, it was put to the Owner rather
than changed unilaterally; both were confirmed:

- `POST /api/orders` widened to `project_coordinator` **and**
  `company_owner` (PC stays the normal day-to-day path).
  `ProjectDetailPage`'s form gate matches.
- New `PATCH /api/orders/{id}` (`OrderRepository::update()`) for
  correcting machine name/spec, supplier, engineer, PC override, and
  start date — deliberately excludes `status` and
  `target_handover_date`, which keep their own audited
  transition/commitment-change endpoints rather than becoming a plain
  UPDATE. New `OrderEditForm` component on `OrderDetailPage`, PC/Owner.
- `PATCH /api/orders/{id}/target-handover-date` has existed since
  Phase 1 (reason + Sales Manager/Owner approver, recorded as a
  `commitment_changes` row) but never had a UI — added as a small
  sub-form (PC/Sales Manager/Owner, matching its own existing role
  gate), rather than folding the date into the plain edit form above
  and losing that audit trail.

Verified live: Owner creates an order directly on a project that
already had none from that role; PC edits an existing order's machine
name and confirms it's reflected immediately; PC requests a target
handover date change with a reason and a Sales Manager approver and
confirms the new date sticks. Two new regression tests
(`e2e/order-edit.spec.ts`); full suite now 17/17.

**Assignment (Sales Manager/PC/Engineer/Supplier) was invisible
everywhere in the UI — flagged live.** The Owner pointed out that
who's actually responsible for an order (Sales Manager, PC, Engineer,
Supplier) was never shown anywhere: not on the order detail page, not
in the Owner/Sales Manager/Import Manager portfolio table. The data
was always there (`orders.supplier_id`/`installation_engineer_id`/
`project_coordinator_id`, `projects.sales_manager_id`), just never
surfaced. Fixed:

- `OrderRepository` gained a shared `SELECT_WITH_ASSIGNEES` query
  (used by both `findVisibleToUser` and `findByIdForUser`) that
  resolves all four to names via joins, including the PC fallback
  (`effective_project_coordinator_id`/`project_coordinator_name` —
  the order's own override if set, else the project's default PC —
  the same fallback `Scope::forOrders` already used for visibility,
  now surfaced consistently rather than re-derived ad hoc).
- `OrderDetailPage` shows all four in a dedicated info row.
- `OrderPortfolioTable` (shared by Owner/Sales Manager/Import Manager
  dashboards) gained a Coordinator column.
- Took the opportunity to also view the Sales Manager and PC
  dashboards directly (screenshotted locally) to confirm they exist
  and are substantive, not placeholders, since the Owner hadn't seen
  either firsthand yet.

Same round, the Owner also specified the actual assignment/edit
permission model, since order editing had just been built PC/Owner-only
with no Sales Manager role at all:

- `PATCH /api/orders/{id}` now also allows Sales Manager, but with a
  field-level restriction (rejects the request if it includes anything
  other than `project_coordinator_id`/`installation_engineer_id`/
  `start_date`) — Sales Manager can reassign the PC/Engineer and correct
  the start date, never machine details or the supplier, which stay a
  PC/Owner call.
- `OrderEditForm` now has two tiers matching that gate: PC/Owner see
  every field; Sales Manager sees only the PC/Engineer pickers and the
  start date. Also added a PC-reassignment picker and a start-date
  field to the form itself — neither existed before even for PC/Owner.

Verified live: Sales Manager's edit form shows no machine-name/spec/
supplier fields at all and successfully reassigns the Engineer and
start date. New regression test in `e2e/order-edit.spec.ts`; full
suite now 18/18.

Confirmed unchanged (already matched what the Owner described):
Project creation stays Sales Manager/PC/Owner, deletion stays Owner-only.

**Open question, not yet decided:** the Owner also asked that when the
Owner creates an order, the start/target-handover dates be optional
(left for the Sales Manager/PC to fill in afterward). Both columns are
`NOT NULL` in the schema, and `check_stage_deadlines.php` and the
dashboards' "at risk"/progress logic assume a real date — making them
genuinely nullable means auditing and updating that logic too, not just
relaxing a form field. Not implemented yet pending that decision (see
conversation) — this is a real design fork, not a rounding error, so it
wasn't decided unilaterally.

**Resolved: Owner's dates are now optional, via placeholder defaults —
not nullable columns.** Given the choice above, went with placeholder
dates rather than a schema/cron change. `POST /api/orders` only
requires `start_date`/`target_handover_date` from non-Owner creators;
an Owner-created order missing either defaults to today / today+90 days
(a typical capital-equipment lead time, not a real commitment) so the
record is immediately usable, with the Sales Manager/PC expected to
correct it via the edit form already built. `ProjectDetailPage`'s form
matches (dates not required in the disabled-button check for the
Owner, with a note explaining the default). Verified live
(`e2e/owner-optional-dates.spec.ts`).

**Added: a document can be a plain external link, not just a local
upload.** The Owner asked for a way to reference a FAT/SAT (or other)
video already hosted on YouTube or elsewhere, rather than only local
uploads/Google Drive. `documents.storage_type` gained a third value,
`'link'` (`file_path` = the URL itself, validated as http(s) via
`FILTER_VALIDATE_URL`) — both `POST /orders/{id}/documents` and
`POST /projects/{id}/documents` accept it, and `GET
/documents/{id}/file` returns the URL as JSON for it, matching the
existing `google_drive` pattern. `DocumentsSection` and
`ProjectMediaPage` both gained an "Or a link" input alongside the file
upload, and render an "Open link" link for it in the document list.
No re-hosting, no YouTube API integration — this is deliberately just a
reference, the same trade-off already recorded for `google_drive`
(§4.3.1's access-control note applies here too, at even weaker
strength, since anyone with the URL can open it — treat it as
non-sensitive by design, not something with the same visibility
enforcement local files get).

**Schema migration needed on the live database** (not yet applied —
give this to Chrome alongside the code deploy):
```sql
ALTER TABLE documents MODIFY storage_type ENUM('local','google_drive','link') NOT NULL DEFAULT 'local';
```

Verified live: PC adds a link to a stage document, Sales Manager adds
a link as general project media, both show "Open link" pointing at the
real URL. Two new regression tests; full suite now 21/21.

**Confirmed the order page's per-role authority model already works —
and found/fixed a real leak while checking.** The Owner asked that this
screen (read/modify/comment/structure, by role) be available to every
internal party, Owner through Engineer. Verified this was already true
by logging in as each of the 5 internal roles and screenshotting the
same order: Owner/PC edit everything; Sales Manager edits PC/Engineer/
dates only; Import Manager and Installation Engineer get full read
access (including expanding a stage to see its evidence — documents,
FAT/SAT, etc. — with upload/edit controls correctly hidden) plus
comments; Engineer additionally gets tickets/AMC. No code needed for
internal roles — already correct.

Checking Customer and Supplier the same way surfaced a real bug: the
new Sales Manager/PC/Engineer/Supplier staffing row (added surfacing
assignments, above) rendered unconditionally, leaking BLI's internal
staff names to external logins — never vetted against them when it was
built. Fixed both client-side (`OrderDetailPage` hides the row for
customer/supplier) and server-side (`OrderRepository::redactForRole`
strips those fields from the API response for those roles too — same
discipline already applied to `contract_value`/`currency`, not just a
frontend hide). New regression test
(`e2e/external-role-redaction.spec.ts`) covers both the redaction and
that internal roles are unaffected; full suite now 22/22.

Customer/Supplier dashboards were also spot-checked directly (not just
inferred from code) — both render correctly once given a moment to
load; an initial blank-looking screenshot was a premature capture in
the verification script, not a real bug.

**Live report: "the pipeline doesn't move forward after Requirements
captured," Sales Manager couldn't create an order, per-stage document
progress wasn't clear — asked for a visual flowchart, then a full
lifecycle simulation to find and fix real flow bugs.** Investigated
each report on its own, then ran a from-scratch 12-stage simulation
(creation to handover) to verify.

- **Sales Manager couldn't create an order**: not a bug — it was never
  granted that permission (order creation was PC/Owner only). Widened
  `POST /api/orders` and `ProjectDetailPage`'s form to also allow
  `sales_manager`, matching who can create the Project itself.
- **"Doesn't move forward"**: real root cause found —
  `StageCompletionEvaluator`'s rejection messages referenced raw
  database columns (`"Requirements must be approved
  (requirements.approved_by/approved_at)."`) instead of telling a PC
  what to actually do. Every one of the ~25 messages across all 12
  stages rewritten in plain, actionable language (e.g. "Add a
  requirement below, then ask a Sales Manager or the Owner to approve
  it, before this stage can be marked complete."). The underlying
  mechanics (requirement → approval → complete) were already correct;
  the message just read like a system error instead of a next step.
- **Per-stage document/progress clarity**: addressed by the new
  flowchart below rather than a separate fix — its "Next step" line
  surfaces exactly this.

**New: `PipelineFlowchart`, a visual 12-stage flow on every order
page, visible to every role that can see the order (including
Customer/Supplier — it shows role names only, e.g. "Installation
Engineer," never individual staff, so it needed no redaction).** Shows
every stage as a connected, color-coded node; a summary panel below
names the current stage, a static "Responsible: <role>" line per
stage (`STAGE_RESPONSIBILITY`, kept in sync with
`StageCompletionEvaluator`'s actual gates), and — new backend endpoint
`GET /orders/{id}/stages/{stageId}/completion-status` (read-only,
reuses `StageCompletionEvaluator::canComplete` without mutating
anything) — the live blocking reason, so a PC sees "Next step: Upload
the Purchase Order..." before ever attempting the save, not just after
a failed one.

**Full lifecycle simulation** (`e2e/full-lifecycle.spec.ts`): Sales
Manager creates the order; PC drives stages 1-8 (requirement +
approval, PO upload, milestones, note, FAT pass, shipment + dispatch,
import tracking cleared, delivered); Installation Engineer submits
stages 9/10/11/12 evidence; a real Customer login (not Sales-Manager-
with-evidence) records the stage 10/11/12 acceptances; PC closes out
every stage. Passes clean end to end — confirms the pipeline mechanics
themselves were always sound.

Two things worth a decision later, surfaced by the simulation, neither
changed since they're outside what was reported broken:
- Stages 7 and 8 (import clearance / delivery) each get their own
  separate `customer_import_tracking` row — a PC has to "start
  tracking" again for stage 8 rather than the stage 7 record just
  continuing its status. Might be worth merging into one per-order
  tracker if this proves confusing in real use.
- Every finding above except the Sales Manager permission was actually
  a **test-authoring bug in the simulation itself** (ambiguous
  Playwright locators — "Accept" matching "Site Accept**ance** Test",
  a retry helper double-clicking a toggle, substring collisions
  between specs' fixture data) rather than an application bug — logged
  here since diagnosing them took real effort and the pattern (prefer
  exact-text/role matches over `has-text` substring matches) is worth
  remembering for future specs in this suite.

Full suite now 23/23.

## Round 3 — Live production feedback: dates, customer logins, and a flowchart-visibility report

Live testing on `m.businesslinks-pk.com` surfaced three more gaps, plus a
report that the new Pipeline Flowchart wasn't visible on a live order page.

- **Stage planned dates had no UI at all, for any role**: the backend has
  accepted `planned_start`/`planned_end` on `PATCH
  /orders/{id}/stages/{stageId}` since Phase 1 (with a required reason,
  and — once a customer-informed date is being changed — a Sales
  Manager/Owner approver, per `OrderStageRepository::updatePlannedDates`),
  but no frontend form ever exposed it. Separately, that same endpoint
  was gated `project_coordinator`-only, which silently contradicted the
  agreed rule ("sales manager and PC can modify the dates"). Fixed both:
  widened the role gate to `[project_coordinator, sales_manager]`, added
  a check that a Sales Manager touching `status`/`notes` on that same
  endpoint gets a 403 (`"Only the Project Coordinator can change a
  stage's status or notes."`) since the PC stays the sole stage-status
  writer, and added `StageDatesForm` (mirrors `OrderEditForm`'s existing
  `TargetHandoverDateForm` pattern: date inputs + required reason +
  optional approver dropdown) to each stage's expanded view for PC and
  Sales Manager.
- **Only the Owner could create or reset a project's Customer login**,
  from a separate global admin page (`UserManagementPage`, `/users`)
  that Sales Manager/PC can't even see in the nav — despite PC being the
  one who actually needs the customer logged in, e.g. for SAT approval.
  `POST /api/users`, `POST /api/users/{id}/reset-password` were
  Owner-only; widened both to also accept Sales Manager/PC **for a
  Customer login on a project they're actually assigned to** — checked
  via `ProjectRepository::findByIdForUser` (the same visibility scope
  already used for reads), never any other role and never another
  project's customer. `GET /api/users` also had to be widened carefully:
  a non-owner now may request `role=customer` too, but only paired with
  `scope_project_id` for a project visible to them (`UserRepository::
  listAll` gained a `$scopeProjectId` filter) — otherwise a Sales Manager
  could have listed every customer login across every project in the
  company, which nothing asked for and would leak cross-project customer
  identity. New `CustomerLoginPanel` component on `ProjectDetailPage`
  (visible to Owner/Sales Manager/PC) shows the project's customer login
  if one exists (with a Reset password button) or a small create form if
  not — directly on the project they're already looking at, rather than
  a disconnected admin page. `UserManagementPage`/`/users` itself is
  intentionally left Owner-only and unchanged — it's full account
  administration (role changes, deactivation, the entire user directory),
  a materially bigger surface than "manage this one project's customer."
- **Pipeline Flowchart reported "not visible" on a live order page**:
  code review found nothing wrong — `OrderDetailPage.tsx` renders
  `{order && stages && <PipelineFlowchart .../>}` unconditionally, right
  after the Status/Field grid and before "Edit order details", and the
  full suite (including a dedicated full-lifecycle run) exercises it
  passing 25/25 locally. The screenshot supplied only showed the page
  from "Edit order details" downward — no header, no Status grid either
  — which is fully explained by scroll position, but a stale cached
  `index.html` from before the previous deploy (Bluehost has no
  cache-busting on that file; only the hashed JS/CSS filenames change
  per build) is at least as likely given the machine otherwise behaved
  like the new build (order creation worked for the Sales Manager, which
  is this same deploy's backend change). Not a code fix — cannot be
  reproduced without live access. Verification steps for the next
  deploy: hard-refresh (Ctrl+Shift+R) the order page first; if still
  missing, View Source on the live page and confirm the `<script src>`
  hash matches the JS file actually in the deployed `dist/assets/`
  folder — a mismatch there means the deploy didn't fully take (stale
  `index.html`, or the zip extracted into a subfolder instead of the
  document root).

Full suite now 25/25 (new: `e2e/stage-dates-and-customer-login.spec.ts`,
two tests covering Sales-Manager-vs-PC stage-date/status authority and
Sales-Manager/PC customer-login create+reset, run against the same
shared `PRJ-0001` fixture other specs already use — written to tolerate
either "no customer yet" or "one already exists" on that project,
since spec execution order isn't something to assume).

## Round 4 — "Customer acceptance is not working"

Live report, with a screenshot: SAT stage showed "Accepted by a Sales
Manager — Not yet customer-confirmed" and an Accept button, and clicking
Accept as the customer appeared to do nothing — the banner never changed.

Real bug, in `AcceptanceSection.tsx` only — not the backend. Acceptances
are append-only (a correction is a new row, never an edit), and
`GET .../acceptances` already returns them newest-first (`ORDER BY id
DESC`). The component computed `latest` as `acceptances[acceptances.length
- 1]`, i.e. the *last* array element — which, in a newest-first array, is
the *oldest* row, not the latest. The very first acceptance ever recorded
for a stage (here, the Sales Manager's provisional one) stayed pinned on
screen forever afterward, no matter how many further acceptances —
including the customer's own — were added on top of it. Fixed to
`acceptances[0]`.

Confirming this pinned-to-oldest read was scoped to display only: the
backend's own stage-completion check
(`StageCompletionEvaluator::evaluateFatSat` and its SAT/Training/Handover
counterparts) already ran `ORDER BY id DESC LIMIT 1` directly in SQL, so
a customer's acceptance was always being correctly honored for actually
unblocking the stage — customers just never saw it reflected, which
reads identically to "broken" from their side and is exactly the kind of
thing worth fixing regardless of the backend being sound underneath.

Caught by extending `full-lifecycle.spec.ts`'s SAT step: a Sales Manager
now accepts first (no evidence document), *then* the real customer
accepts, and the test asserts the banner correctly flips to "Genuine
customer acceptance." Every prior acceptance test in this suite only
ever recorded one acceptance per stage, so `acceptances.length - 1` and
`acceptances[0]` were indistinguishable — a single-acceptance flow can't
catch this class of bug; a stage needs at least two, in the exact
Sales-Manager-then-customer order production hit, to tell them apart.

Full suite still 25/25 with this change folded into the existing
full-lifecycle test (no new spec file needed).
