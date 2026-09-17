# Build Roadmap

Phased so each phase is reviewable and usable on its own before the next
begins.

- [ ] **Phase 1 — Core internal system**
  Auth for internal roles (Company Owner, Project Coordinator, Sales
  Manager, Import Manager, Installation & Service Engineer), orders +
  requirements + the 12-stage pipeline (entered/updated by the Project
  Coordinator), document upload, Company Owner portfolio dashboard.
- [ ] **Phase 2 — External logins**
  One customer login per project (`scope_order_id`) and one supplier login
  per supplier company spanning all their projects (`supplier_id`) —
  observer + comment only.
- [ ] **Phase 3 — Shipment & customs detail + notifications**
  Shipment tracking fields, email alerts on milestone due/overdue, comment
  notifications to relevant roles.
- [ ] **Phase 4 — Post-handover service module**
  Service tickets, AMC schedules, customer ticket-raising via their project
  login, Company Owner visibility into open/overdue tickets.
- [ ] **Phase 5 — AI integration layer**
  Claude/Gemini/ChatGPT-backed reports, risk advisory, follow-up drafting,
  monitoring digest.
- [ ] **Phase 6 — Bluehost deployment**
  cPanel MySQL DB, PHP deployment, static frontend build, SSL, cron jobs,
  go-live.

## Open item to revisit

Customer logins are still scoped to one project each (a repeat customer
gets a fresh login per order) — suppliers already got the multi-project
treatment (§5 `suppliers` table). If per-project customer logins become
inconvenient in practice, the fix is a `customers` table mirroring
`suppliers`, linking one login to all of that customer's orders — flagged
here so it's not forgotten, not built until asked for.

## Current status

Phase 0 (system design) — complete, refined based on BLI's actual team
structure. See `docs/ARCHITECTURE.md`.
Not yet started: Phase 1.
