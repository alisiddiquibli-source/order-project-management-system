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
- [ ] **Phase 3b — Notifications**
  Email delivery of the Phase 1 deadline/blocker alerts, comment
  notifications to relevant roles.
- [ ] **Phase 4 — Post-handover service module**
  `amc_contracts`/`amc_visits`, `service_tickets` with resolved-vs-closed,
  business-hours SLA on the **hourly** `check_ticket_sla.php` cron,
  warranty-start-trigger logic, customer ticket-raising, Owner visibility
  into open/overdue tickets and AMC due dates.
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

Not yet started: Phase 3b (notifications), Phase 4 (post-handover
service), Phase 5 (AI layer), and Phase 6 (deployment).
