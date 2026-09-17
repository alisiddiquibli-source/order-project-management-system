# Build Roadmap

Phased so each phase is reviewable and usable on its own before the next
begins.

- [ ] **Phase 1 — Core internal system**
  Auth for internal roles (Company Owner, Sales Manager, Project
  Coordinator, Import Manager, Installation & Service Engineer). Projects
  + orders (one machine each) + requirements + the 12-stage pipeline with
  manually-set target dates (original + current, with `commitment_changes`
  history), stage dependency/exception rules, manufacturing milestones,
  FAT/SAT records with severity-aware punch lists, training records,
  explicit `acceptances`, blocked-stage logging + escalation, document
  upload, channel-scoped comments, the daily deadline/blocker cron, the
  Sales Manager's per-project dashboard, and the Company Owner's portfolio
  dashboard. This is the biggest phase — it's the whole operational core.
- [ ] **Phase 2 — External logins**
  One customer login per project (`scope_project_id`, sees every order in
  it) and one supplier login per supplier company spanning all their
  orders (`supplier_id`) — observer + comment only, channel-scoped.
- [ ] **Phase 3 — Shipment & customs detail + notifications**
  Shipment tracking fields, `customer_import_tracking` for stages 7–8,
  email delivery of the Phase 1 deadline/blocker alerts, comment
  notifications to relevant roles.
- [ ] **Phase 4 — Post-handover service module**
  `amc_contracts`/`amc_visits`, `service_tickets` with resolved-vs-closed
  and SLA response targets, warranty dates, customer ticket-raising,
  Company Owner visibility into open/overdue tickets and AMC due dates.
- [ ] **Phase 5 — AI integration layer**
  Claude/Gemini/ChatGPT-backed status reports, per-order risk advisory
  (Sales Manager + PC + Company Owner), portfolio-level pattern advisory
  for the Company Owner weighted by delay cause/responsibility (not raw
  counts), the acknowledge/dismiss/action workflow on `ai_reports`,
  follow-up drafting, monitoring digest.
- [ ] **Phase 6 — Bluehost deployment**
  cPanel MySQL DB, PHP deployment, static frontend build, SSL, cron jobs,
  go-live.

## Explicitly out of scope for now

- **Payment/value tracking** — `contract_value`/`currency` stay as static
  reference fields; no invoicing, payment milestones, or balance tracking.
  Revisit only if BLI asks for it later.

## Open item to revisit

Customer logins are scoped per project (already covers a customer's
multiple machines within one deal, via `scope_project_id`). If the same
customer later starts a genuinely separate deal, that's still a separate
project and a separate login — intentional, not a gap. Revisit only if BLI
wants one login to span multiple *unrelated* deals for the same customer.

## Current status

Phase 0 (system design) — complete, refined through BLI's team structure,
an external design review (15 points, all resolved), and two scope
clarifications (order = one machine; Engineer submits stage 9–11 evidence,
PC records completion). See `docs/ARCHITECTURE.md`.
Not yet started: Phase 1.
