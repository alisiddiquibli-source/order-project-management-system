# Build Roadmap

Phased so each phase is reviewable and usable on its own before the next
begins.

- [ ] **Phase 1 — Core internal system**
  Auth for internal roles. Projects + orders (one machine each, with
  on_hold/cancelled lifecycle) + requirements + the 12-stage pipeline:
  manually-set target dates (original + current + `commitment_changes`
  with approval rule), stage dependency/exception rules (severity-aware,
  never overriding a fail), manufacturing milestones (non-empty
  requirement), `engineer_reports`/`fat_sat_records`/`training_records`
  evidence tables, FAT/SAT photo & video capture via Google Drive
  alongside locally-stored PDF reports (§4.3.1), the `acceptances` model
  (with the customer-acceptance requirement for SAT/handover), blocked-stage
  logging + escalation, document upload, channel-scoped comments with
  per-supplier project-level sharing, the daily deadline/blocker cron,
  Sales Manager and Company Owner dashboards. This is the biggest phase —
  the whole operational core.
- [ ] **Phase 2 — External logins**
  One customer login per project (`scope_project_id`) and one supplier
  login per supplier company (`supplier_id`) — comment-only, channel-
  scoped, customer acceptance authority wired in.
- [ ] **Phase 3 — Shipment & customs detail + notifications**
  Shipment tracking with `actual_dispatch_date` gating stage 6 completion,
  per-stage `customer_import_tracking` (+ update history) for stages 7–8,
  email delivery of Phase 1 alerts, comment notifications.
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
Not yet started: Phase 1.
