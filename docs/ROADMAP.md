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
- [ ] **Phase 5 — AI integration layer**
  Status reports, per-order risk advisory, portfolio pattern advisory
  attributed by `blockers.responsible_party` (not raw counts), the
  acknowledge/dismiss/action lifecycle on `ai_reports`, follow-up
  drafting, monitoring digest. Scope filter enforced in the data-gathering
  layer, not the caller.
- [~] **Frontend** (not one of the numbered backend phases — tracked
  alongside them)
  React + TypeScript + Vite + Tailwind. Built: login, JWT handling with
  silent refresh, Company Owner's portfolio dashboard, Project
  Coordinator's order list + order detail page with live stage status
  updates (a real write path — API business-rule rejections are shown to
  the user verbatim, not swallowed). Verified with a real Chromium
  browser against a live backend + database, screenshotted, not just
  type-checked. Pending: Sales Manager/Import Manager/Installation &
  Service Engineer/Supplier/Customer dashboards (they land on a
  placeholder today — login and API access already work for them);
  evidence sub-forms (milestones, FAT/SAT, engineer reports, training,
  acceptances) in the order detail page; a committed Playwright e2e
  suite with real seed fixtures (a one-off manual smoke test was run
  during development, not committed as-is).
- [ ] **Phase 6 — Bluehost deployment**
  cPanel MySQL DB, PHP deployment, static frontend build, SSL, both cron
  jobs (daily + hourly), go-live.

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

Frontend — a real vertical slice, not just scaffolding: Company Owner and
Project Coordinator dashboards work end-to-end against the live backend,
verified in an actual Chromium browser (screenshots taken, not just
"it compiles"). Other five roles' dashboards are the next frontend work.

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

Not yet started: Phase 5 (AI layer), Phase 6 (deployment), and the
remaining frontend work (five role dashboards, evidence sub-forms, and
now the Phase 3b/4 UI: comments already have a UI, but AMC/service-ticket
screens don't exist yet).
